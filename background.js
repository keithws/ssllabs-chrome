/* globals chrome */

var cache, defaults, hostnames, timeout;

cache = nodeCache;
defaults = {
	"auto": true,
	"maxAge": 72,
	"depth": "doc",
	"publish": true,
	"ignoreMismatch": false
};
hostnames = {};
timeouts = {};

(function background () {

	"use strict";

	var requestFilter, ssllabsAPIPrefix, ssllabsPrefix;

	ssllabsPrefix = "https://www.ssllabs.com/ssltest/analyze.html?d=";
	ssllabsAPIPrefix = "https://api.ssllabs.com/api/v2/analyze?fromCache=on&all=done&host=";

	/**
	 * helper function to extract the hostname
	 * @arg {Mixed} location - a string or object representing the URL
	 * @returns {String} hostname
	 */
	function getHostname (location) {

		var aTag, hostname, url;

		url = location || window.location;

		if (typeof url === "string" && url !== null) {

			aTag = document.createElement("a");
			aTag.href = url;
			url = aTag;

		}

		if (url && url.hostname) {

			hostname = url.hostname;

		}

		return hostname;

	}

	/**
	 * onBeforeRequestListener
	 * @arg {Object} details
	 * @returns {undefined}
	 */
	function onBeforeRequestListener (details) {

		var hostname;

		hostname = getHostname(details.url);
		if (hostnames[details.tabId]) {

			if (hostnames[details.tabId].indexOf(hostname) === -1) {

				hostnames[details.tabId].push(hostname);

			}

		} else {

			hostnames[details.tabId] = [hostname];

		}

	}

	/**
	 * addListenerToLogHostnames
	 * @arg {String} depth
	 * @returns {undefined}
	 */
	function addListenerToLogHostnames (depth) {

		var requestFilter;

		// configure filter base on user options
		requestFilter = {
			"urls": ["*://*/*"]
		};
		switch (depth) {
		case "all":
			requestFilter.types = [
				"main_frame", "sub_frame", "stylesheet", "script", "image",
				"font", "object", "xmlhttprequest", "ping", "other"
			];
			break;
		case "js":
			requestFilter.types = ["main_frame", "sub_frame", "xmlhttprequest", "script"];
			break;
		case "doc":
		default:
			requestFilter.types = ["main_frame"];
			break;
		}

		// listen for requests and store hostnames
		chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestListener, requestFilter);

	}

	// log hostnames accessed in each tab
	// this allow us to get SSL Reports for the hostnames of all resources
	// or just script resources
	// or just the main_frame
	chrome.storage.sync.get(defaults, function (items) {

		addListenerToLogHostnames(items.depth);

	});

	// listen for changes to extention options
	chrome.storage.onChanged.addListener(function(changes, namespace) {

		var key, storageChange;

		for (key in changes) {

			if (key === "depth") {

				storageChange = changes[key];

				// remove listener
				chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestListener);

				// clear hostnames
				hostnames = {};

				// attach new listener
				addListenerToLogHostnames(storageChange.newValue);

				// TODO reload tabs to refrech hostnames?

			}

		}

	});

	chrome.browserAction.onClicked.addListener(function handleClick (tab) {

		var hostname;

		hostname = getHostname(tab.url);
		if (hostnames[tab.id] && hostname.match(/\b\.\b/)) {

			chrome.storage.sync.get(defaults, function (items) {

				// create a new window
				chrome.windows.create({ "width": 1102 }, function (window) {

					var hostnamesForTab, windowId;

					windowId = window.id;
					hostnamesForTab = hostnames[tab.id];
					hostnamesForTab.sort();

					// the hostname of the main_frame should always be first
					if (hostnamesForTab.length > 1 && hostnamesForTab.indexOf(hostname) >= 1) {

						hostnamesForTab.splice(hostnamesForTab.indexOf(hostname), 1);
						hostnamesForTab.unshift(hostname);

					}
					hostnamesForTab.forEach(function (hostname, index) {

						var url;

						url = ssllabsPrefix + encodeURIComponent(hostname);
						if (!items.publish) {

							url += "&hideResults=on";

						}
						if (items.ignoreMismatch) {

							url += "&ignoreMismatch=on&clearCache=on";

						}

						// create a new tab in the new window
						setTimeout(function () {

							if (index === 0) {

								chrome.tabs.update({
									"url": url
								});

							} else {

								chrome.tabs.create({
									"url": url,
									"windowId": windowId
								});

							}

						}, index * 1000);

					});

				});

			});

		}

	});

	function letterToGradePoint (letter) {

		var gp;

		// convert A, B, C, etc to 4, 3, 2, etc
		gp = (letter.charCodeAt(0) - 69) * -1;

		if (letter.length > 1) {

			// convert "+" and "-" to +0.3 and -0.3
			gp += Math.round((letter.charCodeAt(1) - 44) * -10 / 3) / 10;

		}

		return gp;

	}

	function gradePointToLetter (gp) {

		var letter;

		letter = String.fromCharCode((Math.round(gp) * -1) + 69);

		if (gp % 1 !== 0) {

			// convert 0.3 to + and 0.7 to -
			letter +=  String.fromCharCode(Math.round(
				(gp - Math.round(gp)) * 10 * 3 / -10
			) + 44);

		}

		return letter;

	}

	function reportGrade (data, tabId) {

		var gpas, grade, color;

		// convert grades to grade points for comparision
		gpas = data.endpoints.map(function (endpoint) {

			return letterToGradePoint(endpoint.grade || "F");

		});

		// find lowest grade point
		gpas.sort();
		grade = gradePointToLetter(gpas[0]);

		switch (grade) {
		case "A+":
		case "A":
		case "A-":
			color = "#72D43D";
			break;
		case "B":
		case "C":
		case "D":
			color = "#FFCD21";
			break;
		case "E":
		case "F":
		case "T":
		default:
			color = "#FF462C";
			break;
		}

		chrome.browserAction.setBadgeBackgroundColor({
			"tabId": tabId,
			"color": color
		});

		chrome.browserAction.setBadgeText({
			"tabId": tabId,
			"text": grade
		});

	}

	function analyze (hostname, items, tabId) {

		var request, url;

		url = ssllabsAPIPrefix + hostname;
		if (items.maxAge) {

			// add the maxAge parameter to the URL
			url += "&maxAge=" + encodeURIComponent(items.maxAge);

		}
		if (items.publish) {

			// add the publish parameter to the URL
			url += "&publish=on";

		}
		if (items.ignoreMismatch) {

			// add the ignoreMismatch parameter to the URL
			url += "&ignoreMismatch=on";

		}

		// go get new data to cache
		request = new XMLHttpRequest();
		request.open("GET", url, true);
		request.onload = function handleLoad () {

			var data, expires, wait;

			if (this.status >= 200 && this.status < 400) {

				// Success!
				try {

					data = JSON.parse(this.response);
					expires = items.maxAge * 60 * 60 * 1000;

					if (data.status === "READY") {

						cache.put(hostname, data, expires, function () {

							console.log("SSL Labs cache for " + hostname + " expired.");

						});
						reportGrade(data, tabId);

					} else if (data.status === "ERROR") {

						console.log(data);
						throw new Error(data.statusMessage);

					} else {

						// try again later
						console.log(data);
						chrome.browserAction.setBadgeBackgroundColor({
							"tabId": tabId,
							"color": "#707070"
						});

						chrome.browserAction.setBadgeText({
							"tabId": tabId,
							"text": "…"
						});

						if (data.status === "IN_PROGRESS") {

							wait = 10 * 1000;

						} else {

							wait = 5 * 1000;

						}
						clearTimeout(timeouts[tabId]);
						timeouts[tabId] = setTimeout(function () {

							analyze(hostname, items, tabId);

						}, wait);

					}

				} catch (err) {

					// clear browser action badge
					chrome.browserAction.setBadgeText({
						"tabId": tabId,
						"text": ""
					});
					console.error(err);

				}

			} else {

				// clear browser action badge
				chrome.browserAction.setBadgeText({
					"tabId": tabId,
					"text": ""
				});

				// We reached our target server, but it returned an error
				console.error("We reached our target server, but it returned an error.");

			}

		};
		request.onerror = function handleError (err) {

			// There was a connection error of some sort
			console.error(err);

		};
		request.send();

	}

	chrome.tabs.onUpdated.addListener(function handleUpdate (tabId, changeInfo, tab) {

		var data, hostname, url;

		hostname = getHostname(tab.url);
		// only when loading and only for hostnames containing a dot
		if (changeInfo.status === "loading" && hostname.match(/\b\.\b/)) {

			chrome.storage.sync.get(defaults, function (items) {

				var request;

				// only if the user wants to
				if (items.auto) {

					// check cache for hostname
					data = cache.get(hostname);

					if (data) {

						reportGrade(data, tabId);

					} else {

						analyze(hostname, items, tabId);

					}

				}

			});

		}

	});

}());
