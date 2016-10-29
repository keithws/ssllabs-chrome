var defaults = {
	"auto": true,
	"maxAge": 72,
	"depth": "doc",
	"publish": true,
	"ignoreMismatch": false
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options () {

	// Use default value color = 'red' and likesColor = true.
	chrome.storage.sync.get(defaults, function (items) {
		document.getElementById('auto').checked = items.auto;
		document.getElementById('maxAge').value = items.maxAge;
		switch (items.depth) {
		case "all":
			document.getElementById('depth-all').checked = true;
			break;
		case "js":
			document.getElementById('depth-js').checked = true;
			break;
		case "doc":
		default:
			document.getElementById('depth-doc').checked = true;
			break;
		}
		document.getElementById('publish').checked = items.publish;
		document.getElementById('ignoreMismatch').checked = items.ignoreMismatch;
	});

}

document.addEventListener('DOMContentLoaded', restore_options);

// Saves options to chrome.storage.sync.
function save_options (options) {

	var depthElement;

	depthElement = document.querySelector("input[name=\"depth\"]:checked");

	options = options || {
		"auto": document.getElementById('auto').checked,
		"maxAge": parseInt(document.getElementById('maxAge').value, 10),
		"depth": depthElement.value,
		"publish": document.getElementById('publish').checked,
		"ignoreMismatch": document.getElementById('ignoreMismatch').checked
	};

	chrome.storage.sync.set(options, function handleSet () {

		console.log("Options saved.");

	});

}

// save when a field changes
var inputs = document.querySelectorAll("input");

if (inputs) {

	for (var index = 0; index < inputs.length; index += 1) {

		inputs[index].addEventListener("change", function handleChange () {

			save_options();

		});

	}

}

// show/hide advanced options
var expander = document.getElementById("advanced-options-expander");
if (expander) {

	expander.addEventListener("click", function (event) {

		var added, container, label;

		container = document.getElementById("advanced-options-container");
		if (container) {

			added = container.classList.toggle("advanced-options-hidden");
			label = event.target.querySelector("span");
			if (added) {

				label.innerText = "Show";

			} else {

				label.innerText = "Hide";

			}

		}

	});

}

// reset options
var button = document.getElementById("reset-profile-options");
if (button) {

	button.addEventListener("click", function (event) {

		save_options(defaults);
		restore_options();

	});

}