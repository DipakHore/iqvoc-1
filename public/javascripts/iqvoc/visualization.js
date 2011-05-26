/*jslint browser: true, nomen: false */
/*global jQuery, $jit, IQVOC, HTMLCanvasElement */

jQuery(document).ready(function() {
	IQVOC.visualization.init("infovis");
});

// basic settings -- XXX: cargo-culted from JIT examples
var labelType, nativeTextSupport, useGradients, animate; // XXX: useless globals!?
(function() {
	var ua = navigator.userAgent,
		iOS = ua.match(/iPhone/i) || ua.match(/iPad/i),
		typeOfCanvas = typeof HTMLCanvasElement,
		nativeCanvasSupport = (typeOfCanvas === "object" || typeOfCanvas === "function"),
		textSupport = nativeCanvasSupport
				&& (typeof document.createElement("canvas").getContext("2d").fillText === "function");
	// settings based on the fact that ExCanvas provides text support for IE
	// and that as of today iPhone/iPad current text support is lame
	labelType = (!nativeCanvasSupport || (textSupport && !iOS)) ? "Native" : "HTML";
	nativeTextSupport = labelType === "Native";
	useGradients = nativeCanvasSupport;
	animate = !(iOS || !nativeCanvasSupport);
}());

IQVOC.visualization = (function($) {

var LEVELDISTANCE = 100;
var CONCEPT_URI;
var MAX_CHILDREN = 10; // TODO: rename
var VIZ; // XXX: singleton; hacky - there should be a more elegant way!?

var init = function(container) {
	CONCEPT_URI = $("head link[type='application/json']").attr("href");
	$.getJSON(CONCEPT_URI, function(data, status, xhr) {
		data = transformData(data);
		VIZ = spawn(container, data);
	});
};

// container can be an ID or a DOM element
var spawn = function(container, data) {
	container = container.nodeType ? container : document.getElementById(container);
	$(container).addClass("infvovis");

	// controls
	$.each(["+", "-"], function(i, item) {
		$('<input type="button" class="button" />').val(item).click(function(ev) {
			var d = VIZ.config.Navigation.zooming / 1000;
			d = item == "-" ? 1 - d : 1 + d;
			VIZ.canvas.scale(d, d);
		}).appendTo(container);
	});
	$.each(["label", "relation"], function(i, item) {
		var cb = $('<input type="checkbox" name="entities" checked="checked">')
			.val(item);
		$('<label />').text(item + "s").prepend(cb).appendTo(container);
	});
	$("input[type=checkbox]", container).live("change", onFilter);

	var viz = generateGraph(container, { levelDistance: LEVELDISTANCE });
	viz.filters = []; // TODO: rename? (ambiguous)
	viz.data = data; // XXX: hacky (cf. onFilter below)
	viz.loadJSON(data);
	viz.refresh();

	return viz;
};

var onFilter = function(ev, viz) {
	var el = $(this),
		checked = el.attr("checked"),
		value = el.val();

	if(checked) {
		var pos = VIZ.filters.indexOf(value);
		VIZ.filters.splice(pos, 1);
	} else {
		VIZ.filters.push(value);
	}

	el.closest(".infvovis").toggleClass("filtered", VIZ.filters.length > 0);

	VIZ.loadJSON(VIZ.data); // XXX: this seems like overkill
	VIZ.refresh();
};

var visitConcept = function(conceptID) {
	var cue = "/concepts/";
	var host = CONCEPT_URI.split(cue)[0]; // XXX: hacky and brittle
	window.location = host + cue + conceptID;
};

var generateGraph = function(container, options) {
	options = $.extend(options, {
		injectInto: container,

		Navigation: {
			enable: true,
			panning: "avoid nodes",
			zooming: 100
		},

		width: container.offsetWidth,
		height: container.offsetHeight,

		levelDistance: options.leveldistance,

		// concentric circle as background (cargo-culted from RGraph example)
		background: {
			CanvasStyles: {
				strokeStyle: "#AAA",
				shadowBlur: 50
				//shadowColor: "#EEE" // XXX: fills entire background in Chrome!?
			}
		},
		// styles
		Node: {
			overridable: true,
			dim: 5,
			color: "#F00"
		},
		Edge: {
			overridable: true,
			lineWidth: 2,
			color: "#888"
		},

		// add text and attach event handlers to labels
		onCreateLabel: function(domEl, node) {
			$(domEl).html(node.name);
			if(node.data.etype !== "label") {
				$jit.util.addEvent(domEl, "click", function(ev) {
					visitConcept(node.id);
				});
			}
		},

		// change node styles when labels are placed/moved
		onPlaceLabel: function(domEl, node) {
			var css = {},
				classes = ["level" + node._depth, node.data.etype || "concept"];
			// ensure label covers the underlying node
			css.height = css.lineHeight = node.Node.height + "px";
			$(domEl).addClass(classes.join(" ")).css(css);

			// ensure label is centered on the symbol
			var style = domEl.style;
			var x = parseInt(style.left, 10);
			var y = parseInt(style.top, 10);
			style.top = (y - domEl.offsetHeight / 2) + "px";
			style.left = (x - domEl.offsetWidth / 2) + "px";
		},

		onBeforePlotLine: function(adj) {
			if(adj.nodeTo.data.etype === "label") {
				adj.nodeTo.data.$type = "square";
				adj.nodeTo.data.$color = "#EEE";
				adj.data.$lineWidth = adj.Edge.lineWidth / 2;
				adj.data.$color = "#00A";
				adj.data.$alpha = 0.5;
			} else {
				var node = adj.nodeTo; // nodeTo is always the inner node!?
				var alpha = determineTransparency(node._depth);
				if(alpha) {
					node.setData("alpha", alpha);
					adj.setData("alpha", alpha);
				}
			}

			$.each([adj.nodeFrom, adj.nodeTo], function(i, node) { // XXX: inefficient and fugly
				var etype = node.data ? node.data.etype : null;
				if(VIZ) {
					var hideRelations = VIZ.filters.indexOf("relation") !== -1;
					var rootLabel = node._depth === 1 && etype === "label";
					if((hideRelations && node._depth > 0 && !rootLabel) ||
							(etype && VIZ.filters.indexOf(etype) !== -1)) {
						adj.data.$alpha = 0;
						node.data.$alpha = 0;
					}
				}
			});
		}
	});
	return new $jit.RGraph(options);
};

// create a JIT-compatible JSON tree structure from a concept representation
var transformData = function(concept) {
	return generateConceptNode(concept);
};

// generate node from iQvoc concept representation
var generateConceptNode = function(concept) {
	if(typeof concept.relations === "number") {
		concept.relations = generateDummyConcepts(concept.relations);
	}
	var labels = $.map(concept.labels || [], generateLabelNode);
	groupChildNodes(labels, "label");
	var relations = $.map(concept.relations || [], generateConceptNode);
	groupChildNodes(relations);
	// combine labels and relations in alternating order
	var children = $.map(labels, function(label, i) {
		return relations.length ? [label, relations.pop()] : label;
	});
	return {
		id: concept.origin,
		name: labels.length ? labels[0].name : "", // XXX: should use actual pref label
		children: children
	};
};

// generate node from iQvoc label representation
var generateLabelNode = function(label) {
	return {
		id: label.origin,
		name: label.value,
		data: { etype: "label" }
		// TODO: relations to other concepts (XL only)
	};
};

// generate dummy iQvoc label representations
var generateDummyConcepts = function(count) {
	return $.map(new Array(count), function(item, i) {
		return { origin: Math.random() };
	});
};

// combine excessive child nodes in a single placeholder node
var groupChildNodes = function(nodes, etype) { // TODO: rename
	if(nodes.length > MAX_CHILDREN) {
		var excess = nodes.splice(MAX_CHILDREN - 1);
		var placeholder = {
			id: Math.random(),
			name: "&hellip;",
			data: { nodes: excess } // XXX: currently unused
		};
		if(etype) {
			placeholder.data.etype = etype;
		}
		nodes.push(placeholder);
	}
};

var determineTransparency = function(depth) {
	if(depth === 2) {
		return 0.6;
	} else if(depth > 2) {
		return 0.3;
	}
};

// hijack setPos method to reduce the relative distance for label nodes -- XXX: modifies all Node instances!
var _setPos = $jit.Graph.Node.prototype.setPos;
$jit.Graph.Node.prototype.setPos = function(value, type) {
	if(this.data.etype === "label") {
		value.rho = value.rho - (LEVELDISTANCE * 0.5);
	}
	return _setPos.apply(this, arguments);
};

return {
	init: init
};

}(jQuery));
