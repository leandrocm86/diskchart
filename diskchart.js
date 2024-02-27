const MAX_SLICES = 7  // The seventh slice is turned into "others", with the sum of all slices from 7th onwards.
const LANDSCAPE = window.matchMedia("(orientation: landscape)").matches
const slcMountpoint = document.getElementById('mountpoint')
const hDisplayMessage = document.getElementById('display-message')
const chartContainer = document.getElementById('chart-container')
const lblCached = document.getElementById('cached')
const btnRefresh = document.getElementById('refresh')
const crumbScroll = document.getElementById('crumb-scroll')
const canvas = document.getElementById('canvas')

var totalKB = 0;
var mountpoints = [];
var cachedJSONs = [];
var currentParent;
var Chart;
var chart;

class Slice {
	constructor(label, value) {
		this.label = label
		this.value = value
	}
}

function createSlices(json) {
	let slices = []
	totalKB = 0
	json.contentSizes.forEach(content => {
		let space = parseInt(content.split('=')[1])
		if (space > 0) {
		    let label = content.split('=')[0].trim().substring(currentParent.length)
			slices.push(new Slice(label, space))
			totalKB += space
		}
	})
	slices = slices.sort((a, b) => b.value - a.value)
	if (slices.length > MAX_SLICES) {
		let sum_others = 0
		for (let i = MAX_SLICES - 1; i < slices.length; i++) {
			sum_others += slices[i].value
		}
		slices[MAX_SLICES - 1].label = 'Others'
		slices[MAX_SLICES - 1].value = sum_others
		slices = slices.slice(0, MAX_SLICES)
	}
	if (json.availableSpace != null && json.availableSpace > 0) {
		slices.unshift(new Slice('Free', json.availableSpace))
		totalKB += json.availableSpace
	}
	return slices
}

function normalize(path) {
    path = path.trim()
    if (path != '/' && path.endsWith('/'))
        path = path.substring(0, path.length - 1)
    return path
}

function createBreadcrumbs(path) {
    let crumbs = []
    function addElement(label, target) {
        let newElement = document.createElement('a')
        newElement.innerHTML = label
        if (target) {
            newElement.href = '#'
            newElement.onclick = () => fetchData(target)
        }
        crumbs.push(newElement)
    }
    let folders = path.split('/')
    for (let i = 1; i < folders.length; i++) {
        addElement('/')
        let folderName = folders[i]
        let folderPath = folders.slice(0, i+1).join('/')
        let reachable = mountpoints.some(mountpoint => folderPath.includes(mountpoint))
        let target = i < folders.length - 1 && reachable ? folderPath : null
		addElement(folderName, target)
    }
    let rootFolder = crumbs[0] // crumbs[0] == '/'
    if (folders[0] != '') {
        rootFolder = document.createElement('a')
        rootFolder.innerHTML = folders[0]
        crumbs.unshift(rootFolder)
    }
	if (mountpoints.includes(rootFolder.innerHTML)) {
		rootFolder.href = '#'
        rootFolder.onclick = () => fetchData(rootFolder.innerHTML)
    }
    return crumbs
}

function displayMessage(message) {
	if (message == null || message == '') {
		hDisplayMessage.style.display = 'none'
		chartContainer.style.visibility = 'visible'
	} else {
		hDisplayMessage.innerHTML = message
		hDisplayMessage.style.display = 'block'
		chartContainer.style.visibility = 'hidden'
	}
}

async function listMountpoints() {
    let response = await fetch('/api/diskchart/mountpoints')
    let json = await response.json()
    return json
}

async function fetchData(target, nocache) {
    target = normalize(target)
    if (cachedJSONs[target] != null && !nocache) {
		processResponse(target, cachedJSONs[target])
		lblCached.style.display = 'inline-block'
		return
    }
    lblCached.style.display = 'none'
	displayMessage(`Calculating sizes from ${target}. This may take a few minutes. Please wait ...`)
	fetch('/api/diskchart?target=' + target).then(response => {
		btnRefresh.style.display = 'inline-block'
		if (!response.ok) {
			console.log(`Failed to load data from ${target}. Status code: ${response.status}. Message: ${response.statusText}`)
			response.json().then(json => {
				alert(json.error)
				displayMessage(null)
			}).catch(error => displayMessage(error))
		}
		else {
			displayMessage(null)
			response.json().then(json => {
				if (json.contentSizes && json.contentSizes.length > 0) {
					processResponse(target, json)
					if (json.ellapsedTime > 5)
		                cachedJSONs[target] = json
				}
				else
					alert('No content found for ' + target)
			})
			.catch(error => displayMessage(error))
		}
	})
}

function processResponse(target, json) {
    currentParent = target.endsWith('/') ? target : target + '/'
    renderPieChart(json)

	if (mountpoints.length > 1 && mountpoints.some(mountpoint => mountpoint == target)) {
		slcMountpoint.value = target
		slcMountpoint.style.display = 'inline-block'
		crumbScroll.style.display = 'none'
	} else
		renderBreadcrumbs(target)
}

function renderBreadcrumbs(target) {
	slcMountpoint.style.display = 'none'
	crumbScroll.style.display = LANDSCAPE ? 'inline' : 'block'
	crumbScroll.innerHTML = ''
	const crumbs = createBreadcrumbs(target)
	crumbs.forEach(crumb => crumbScroll.appendChild(crumb))
	crumbScroll.scrollLeft = crumbScroll.scrollWidth - crumbScroll.clientWidth;
}

function renderPieChart(json) {
    
    // Prepare data to create chart
	let slices = createSlices(json)
	const data = {
		labels: slices.map(slice => slice.label),
		datasets: [{
			data: slices.map(slice => slice.value),
			backgroundColor: [
			    'rgba(192,  57,  43,  1)',
			    'rgba(255,  165,  0,  0.8)',
			    'rgba(0,  132,  255,  0.6)',
			    'rgba(124,  252,  0,  0.4)',
			    'rgba(128,  0,  128,  0.3)',
			    'rgba(255,  192,  203,  0.2)',
			    'rgba(120,  120,  120,  1)'
			]
		}]
	};
	if (slices[0].label == 'Free') // 'Free' is always grey
		data.datasets[0].backgroundColor.unshift('rgba(220,  220,  220,  1)');

    // Create/recreate chart
	if (chart != null)
		chart.destroy();
	const ctx = canvas.getContext('2d');
	chart = new Chart(ctx, {
		type: 'pie',
		data: data,
		options: {
			onClick: function(e, elements) {
				if (elements.length > 0) {
					var index = elements[0].index;
					var label = this.data.labels[index];
					if (label != 'Free' && label != 'Others')
						fetchData(currentParent + label)
				}
			},
			responsive: true,
			maintainAspectRatio: !LANDSCAPE,
			plugins: {
				legend: {
					labels: {
						font: {
							size: fontSize
						}
					}
				},
				tooltip: {
					titleFont: {
						size: fontSize
					},
					bodyFont: {
						size: fontSize
					},
					callbacks: {
						label: function(context) {
							return ` ${Math.round(context.raw / 1024)}MB (${Math.round(context.raw / totalKB * 100)}%)`
						}
					}
				}
			}
		}
	});
}

function fontSize(context) {
	return LANDSCAPE ? context.chart.width * 0.02 : context.chart.height * 0.03;
}

export function init(chartConstructor) {
	Chart = chartConstructor

	listMountpoints().then(json => {
		mountpoints = json.mountpoints
		if (mountpoints.length == 1)
			fetchData(mountpoints[0])
		else {
			mountpoints.forEach(mountpoint => {
				let option = document.createElement('option')
				option.value = mountpoint
				option.innerHTML = mountpoint
				slcMountpoint.appendChild(option)
			})
			slcMountpoint.onchange = () => {
				fetchData(slcMountpoint.value)
			}
			slcMountpoint.style.display = 'inline-block'
		}
	})

	btnRefresh.onclick = () => fetchData(currentParent, true)
}
