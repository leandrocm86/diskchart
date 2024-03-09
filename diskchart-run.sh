#!/bin/sh

LOGFILE='/diskchart.log'

# Clean PyInstaller's temporary files from previous restarts.
rm -rf /tmp/*

# Start nginx for the frontend.
nginx >> $LOGFILE &

# Start the backend API.
/diskchart-api.bin >> $LOGFILE &

# Wait 3 seconds and print information about opened ports.
sleep 3 && netstat -tunlp >> $LOGFILE

# Keep reading the logs.
tail -f $LOGFILE
