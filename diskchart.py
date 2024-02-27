from bottle import route, run, request, response
from urllib.parse import unquote
import os
import time
import json

BIND_MOUNTS = json.loads(os.environ['BINDINGS'])


def du(path):
    ''' Runs du on the request path's contents and returns all its output.
        Ignores subfolders that are mount points (because they use space from other partitions). '''

    # du_command = "parallel 'if ! mountpoint -q {}; then du -xs {}; else echo \"skipping {} for being a mount point\"; fi' ::: " + contents + " 2>&1"
    du_command = 'find "' + path + '" -mindepth 1 -maxdepth 1 | while read -r i; do if ! mountpoint -q "$i"; then du -xs "$i"; else echo "skipping $i for being a mount point"; fi; done 2>&1'
    print('Executing command: ', du_command)
    output = os.popen(du_command).readlines()
    return output


def df_available_space(target) -> int | None:
    ''' Runs df and checks if the requested path is one of the mounted partitions.
        If so, returns the free space (in Mb). If not, returns None. '''

    df_out = os.popen('df').readlines()
    for out in df_out:
        cols = out.split()
        if cols[5] == target:
            return int(cols[3])


def get_mounted_path(requested_path: str) -> str | None:
    ''' Given the desired path from the host to have the sizes measured,
        returns its equivalent path at the bind-mounted volume in the container. '''
    return _translate(BIND_MOUNTS, requested_path)


def get_host_path(requested_path: str) -> str | None:
    ''' Given the desired path from the container to have the sizes measured,
        returns its equivalent path for the original bind-mounted volume from the host. '''
    return _translate({v: k for k, v in BIND_MOUNTS.items()}, requested_path)


def _translate(mappings: dict[str, str], path_to_translate: str):
    possible_keys = [key for key in mappings if path_to_translate.startswith(key)]
    if not possible_keys:
        return None

    volume_key = max(possible_keys, key=lambda bind: len(bind))
    volume_translation = mappings[volume_key]

    if volume_key.endswith('/') and not volume_translation.endswith('/'):
        volume_translation += '/'

    if volume_translation.endswith('/') and not volume_key.endswith('/'):
        volume_key += '/'

    return path_to_translate.replace(volume_key, volume_translation, 1)


@route('/api/diskchart/mountpoints')
def list_mountpoints():
    print('get mountpoints!')
    ''' Endpoint to be called at page loading for listing the mountpoint options. '''
    return {'mountpoints': sorted([k for k in BIND_MOUNTS.keys()], key=lambda path: len(path))}


@route('/api/diskchart')
def get_disk_data():
    ''' Endpoint for retrieving disk usage data. '''

    target = request.query_string.partition('target=')[2]
    target = unquote(target)
    start_time = time.time()
    mounted_path = get_mounted_path(target)

    if not mounted_path:
        response.status = 404
        return {'error': f'No bind-mounted volume mapped for path {target} was found.'}

    if not os.path.exists(mounted_path):
        response.status = 404
        return {'error': f'Target path {target} (mapped as {mounted_path}) was not found.'}

    if not os.path.isdir(mounted_path):
        response.status = 400
        return {'error': f'Target path {target} (mapped as {mounted_path}) is not a directory.'}

    du_output = du(mounted_path)
    content_sizes = []
    for output in du_output:
        split = output.split('\t')
        if split[0].isdigit() and int(split[0]):
            content_sizes.append(f'{get_host_path(split[1])}={split[0]}')
    
    if not content_sizes:
        response.status = 400
        return {'error': f'No disk space being used in folder {target}.'}

    return {
        'contentSizes': content_sizes,
        'messages': [out for out in du_output if not out.split()[0].isdigit()],
        'availableSpace': df_available_space(mounted_path.removesuffix('/')),
        'ellapsedTime': time.time() - start_time
    }


if __name__ == '__main__':

    for label, mount in BIND_MOUNTS.items():
        print(f'{mount} declared as mount point with label {label}')

    run(host='localhost', port=8080)
