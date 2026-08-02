import { c as matcher_default, d as namespace_default, l as selectorAll_default, o as selection, s as styleValue, u as selector_default } from "./d3-drag+d3-selection.mjs";
import { t as dispatch } from "./d3-dispatch.mjs";
import { t as color } from "./d3-color.mjs";
import { a as number_default, i as string_default, n as interpolateTransformCss, o as rgb_default, r as interpolateTransformSvg } from "./d3-interpolate.mjs";
import { c as timer, s as now } from "./d3-force-3d+[...].mjs";
import { t as timeout_default } from "./d3-timer.mjs";
import { t as cubicInOut } from "./d3-ease.mjs";
//#region node_modules/d3-transition/src/transition/schedule.js
var emptyOn = dispatch("start", "end", "cancel", "interrupt");
var emptyTween = [];
function schedule_default(node, name, id, index, group, timing) {
	var schedules = node.__transition;
	if (!schedules) node.__transition = {};
	else if (id in schedules) return;
	create(node, id, {
		name,
		index,
		group,
		on: emptyOn,
		tween: emptyTween,
		time: timing.time,
		delay: timing.delay,
		duration: timing.duration,
		ease: timing.ease,
		timer: null,
		state: 0
	});
}
function init(node, id) {
	var schedule = get(node, id);
	if (schedule.state > 0) throw new Error("too late; already scheduled");
	return schedule;
}
function set(node, id) {
	var schedule = get(node, id);
	if (schedule.state > 3) throw new Error("too late; already running");
	return schedule;
}
function get(node, id) {
	var schedule = node.__transition;
	if (!schedule || !(schedule = schedule[id])) throw new Error("transition not found");
	return schedule;
}
function create(node, id, self) {
	var schedules = node.__transition, tween;
	schedules[id] = self;
	self.timer = timer(schedule, 0, self.time);
	function schedule(elapsed) {
		self.state = 1;
		self.timer.restart(start, self.delay, self.time);
		if (self.delay <= elapsed) start(elapsed - self.delay);
	}
	function start(elapsed) {
		var i, j, n, o;
		if (self.state !== 1) return stop();
		for (i in schedules) {
			o = schedules[i];
			if (o.name !== self.name) continue;
			if (o.state === 3) return timeout_default(start);
			if (o.state === 4) {
				o.state = 6;
				o.timer.stop();
				o.on.call("interrupt", node, node.__data__, o.index, o.group);
				delete schedules[i];
			} else if (+i < id) {
				o.state = 6;
				o.timer.stop();
				o.on.call("cancel", node, node.__data__, o.index, o.group);
				delete schedules[i];
			}
		}
		timeout_default(function() {
			if (self.state === 3) {
				self.state = 4;
				self.timer.restart(tick, self.delay, self.time);
				tick(elapsed);
			}
		});
		self.state = 2;
		self.on.call("start", node, node.__data__, self.index, self.group);
		if (self.state !== 2) return;
		self.state = 3;
		tween = new Array(n = self.tween.length);
		for (i = 0, j = -1; i < n; ++i) if (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) tween[++j] = o;
		tween.length = j + 1;
	}
	function tick(elapsed) {
		var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = 5, 1), i = -1, n = tween.length;
		while (++i < n) tween[i].call(node, t);
		if (self.state === 5) {
			self.on.call("end", node, node.__data__, self.index, self.group);
			stop();
		}
	}
	function stop() {
		self.state = 6;
		self.timer.stop();
		delete schedules[id];
		for (var i in schedules) return;
		delete node.__transition;
	}
}
//#endregion
//#region node_modules/d3-transition/src/interrupt.js
function interrupt_default$1(node, name) {
	var schedules = node.__transition, schedule, active, empty = true, i;
	if (!schedules) return;
	name = name == null ? null : name + "";
	for (i in schedules) {
		if ((schedule = schedules[i]).name !== name) {
			empty = false;
			continue;
		}
		active = schedule.state > 2 && schedule.state < 5;
		schedule.state = 6;
		schedule.timer.stop();
		schedule.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule.index, schedule.group);
		delete schedules[i];
	}
	if (empty) delete node.__transition;
}
//#endregion
//#region node_modules/d3-transition/src/selection/interrupt.js
function interrupt_default(name) {
	return this.each(function() {
		interrupt_default$1(this, name);
	});
}
//#endregion
//#region node_modules/d3-transition/src/transition/tween.js
function tweenRemove(id, name) {
	var tween0, tween1;
	return function() {
		var schedule = set(this, id), tween = schedule.tween;
		if (tween !== tween0) {
			tween1 = tween0 = tween;
			for (var i = 0, n = tween1.length; i < n; ++i) if (tween1[i].name === name) {
				tween1 = tween1.slice();
				tween1.splice(i, 1);
				break;
			}
		}
		schedule.tween = tween1;
	};
}
function tweenFunction(id, name, value) {
	var tween0, tween1;
	if (typeof value !== "function") throw new Error();
	return function() {
		var schedule = set(this, id), tween = schedule.tween;
		if (tween !== tween0) {
			tween1 = (tween0 = tween).slice();
			for (var t = {
				name,
				value
			}, i = 0, n = tween1.length; i < n; ++i) if (tween1[i].name === name) {
				tween1[i] = t;
				break;
			}
			if (i === n) tween1.push(t);
		}
		schedule.tween = tween1;
	};
}
function tween_default(name, value) {
	var id = this._id;
	name += "";
	if (arguments.length < 2) {
		var tween = get(this.node(), id).tween;
		for (var i = 0, n = tween.length, t; i < n; ++i) if ((t = tween[i]).name === name) return t.value;
		return null;
	}
	return this.each((value == null ? tweenRemove : tweenFunction)(id, name, value));
}
function tweenValue(transition, name, value) {
	var id = transition._id;
	transition.each(function() {
		var schedule = set(this, id);
		(schedule.value || (schedule.value = {}))[name] = value.apply(this, arguments);
	});
	return function(node) {
		return get(node, id).value[name];
	};
}
//#endregion
//#region node_modules/d3-transition/src/transition/interpolate.js
function interpolate_default(a, b) {
	var c;
	return (typeof b === "number" ? number_default : b instanceof color ? rgb_default : (c = color(b)) ? (b = c, rgb_default) : string_default)(a, b);
}
//#endregion
//#region node_modules/d3-transition/src/transition/attr.js
function attrRemove(name) {
	return function() {
		this.removeAttribute(name);
	};
}
function attrRemoveNS(fullname) {
	return function() {
		this.removeAttributeNS(fullname.space, fullname.local);
	};
}
function attrConstant(name, interpolate, value1) {
	var string00, string1 = value1 + "", interpolate0;
	return function() {
		var string0 = this.getAttribute(name);
		return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
	};
}
function attrConstantNS(fullname, interpolate, value1) {
	var string00, string1 = value1 + "", interpolate0;
	return function() {
		var string0 = this.getAttributeNS(fullname.space, fullname.local);
		return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
	};
}
function attrFunction(name, interpolate, value) {
	var string00, string10, interpolate0;
	return function() {
		var string0, value1 = value(this), string1;
		if (value1 == null) return void this.removeAttribute(name);
		string0 = this.getAttribute(name);
		string1 = value1 + "";
		return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
	};
}
function attrFunctionNS(fullname, interpolate, value) {
	var string00, string10, interpolate0;
	return function() {
		var string0, value1 = value(this), string1;
		if (value1 == null) return void this.removeAttributeNS(fullname.space, fullname.local);
		string0 = this.getAttributeNS(fullname.space, fullname.local);
		string1 = value1 + "";
		return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
	};
}
function attr_default(name, value) {
	var fullname = namespace_default(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate_default;
	return this.attrTween(name, typeof value === "function" ? (fullname.local ? attrFunctionNS : attrFunction)(fullname, i, tweenValue(this, "attr." + name, value)) : value == null ? (fullname.local ? attrRemoveNS : attrRemove)(fullname) : (fullname.local ? attrConstantNS : attrConstant)(fullname, i, value));
}
//#endregion
//#region node_modules/d3-transition/src/transition/attrTween.js
function attrInterpolate(name, i) {
	return function(t) {
		this.setAttribute(name, i.call(this, t));
	};
}
function attrInterpolateNS(fullname, i) {
	return function(t) {
		this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
	};
}
function attrTweenNS(fullname, value) {
	var t0, i0;
	function tween() {
		var i = value.apply(this, arguments);
		if (i !== i0) t0 = (i0 = i) && attrInterpolateNS(fullname, i);
		return t0;
	}
	tween._value = value;
	return tween;
}
function attrTween(name, value) {
	var t0, i0;
	function tween() {
		var i = value.apply(this, arguments);
		if (i !== i0) t0 = (i0 = i) && attrInterpolate(name, i);
		return t0;
	}
	tween._value = value;
	return tween;
}
function attrTween_default(name, value) {
	var key = "attr." + name;
	if (arguments.length < 2) return (key = this.tween(key)) && key._value;
	if (value == null) return this.tween(key, null);
	if (typeof value !== "function") throw new Error();
	var fullname = namespace_default(name);
	return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
}
//#endregion
//#region node_modules/d3-transition/src/transition/delay.js
function delayFunction(id, value) {
	return function() {
		init(this, id).delay = +value.apply(this, arguments);
	};
}
function delayConstant(id, value) {
	return value = +value, function() {
		init(this, id).delay = value;
	};
}
function delay_default(value) {
	var id = this._id;
	return arguments.length ? this.each((typeof value === "function" ? delayFunction : delayConstant)(id, value)) : get(this.node(), id).delay;
}
//#endregion
//#region node_modules/d3-transition/src/transition/duration.js
function durationFunction(id, value) {
	return function() {
		set(this, id).duration = +value.apply(this, arguments);
	};
}
function durationConstant(id, value) {
	return value = +value, function() {
		set(this, id).duration = value;
	};
}
function duration_default(value) {
	var id = this._id;
	return arguments.length ? this.each((typeof value === "function" ? durationFunction : durationConstant)(id, value)) : get(this.node(), id).duration;
}
//#endregion
//#region node_modules/d3-transition/src/transition/ease.js
function easeConstant(id, value) {
	if (typeof value !== "function") throw new Error();
	return function() {
		set(this, id).ease = value;
	};
}
function ease_default(value) {
	var id = this._id;
	return arguments.length ? this.each(easeConstant(id, value)) : get(this.node(), id).ease;
}
//#endregion
//#region node_modules/d3-transition/src/transition/easeVarying.js
function easeVarying(id, value) {
	return function() {
		var v = value.apply(this, arguments);
		if (typeof v !== "function") throw new Error();
		set(this, id).ease = v;
	};
}
function easeVarying_default(value) {
	if (typeof value !== "function") throw new Error();
	return this.each(easeVarying(this._id, value));
}
//#endregion
//#region node_modules/d3-transition/src/transition/filter.js
function filter_default(match) {
	if (typeof match !== "function") match = matcher_default(match);
	for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) if ((node = group[i]) && match.call(node, node.__data__, i, group)) subgroup.push(node);
	return new Transition(subgroups, this._parents, this._name, this._id);
}
//#endregion
//#region node_modules/d3-transition/src/transition/merge.js
function merge_default(transition) {
	if (transition._id !== this._id) throw new Error();
	for (var groups0 = this._groups, groups1 = transition._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) if (node = group0[i] || group1[i]) merge[i] = node;
	for (; j < m0; ++j) merges[j] = groups0[j];
	return new Transition(merges, this._parents, this._name, this._id);
}
//#endregion
//#region node_modules/d3-transition/src/transition/on.js
function start(name) {
	return (name + "").trim().split(/^|\s+/).every(function(t) {
		var i = t.indexOf(".");
		if (i >= 0) t = t.slice(0, i);
		return !t || t === "start";
	});
}
function onFunction(id, name, listener) {
	var on0, on1, sit = start(name) ? init : set;
	return function() {
		var schedule = sit(this, id), on = schedule.on;
		if (on !== on0) (on1 = (on0 = on).copy()).on(name, listener);
		schedule.on = on1;
	};
}
function on_default(name, listener) {
	var id = this._id;
	return arguments.length < 2 ? get(this.node(), id).on.on(name) : this.each(onFunction(id, name, listener));
}
//#endregion
//#region node_modules/d3-transition/src/transition/remove.js
function removeFunction(id) {
	return function() {
		var parent = this.parentNode;
		for (var i in this.__transition) if (+i !== id) return;
		if (parent) parent.removeChild(this);
	};
}
function remove_default() {
	return this.on("end.remove", removeFunction(this._id));
}
//#endregion
//#region node_modules/d3-transition/src/transition/select.js
function select_default(select) {
	var name = this._name, id = this._id;
	if (typeof select !== "function") select = selector_default(select);
	for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
		if ("__data__" in node) subnode.__data__ = node.__data__;
		subgroup[i] = subnode;
		schedule_default(subgroup[i], name, id, i, subgroup, get(node, id));
	}
	return new Transition(subgroups, this._parents, name, id);
}
//#endregion
//#region node_modules/d3-transition/src/transition/selectAll.js
function selectAll_default(select) {
	var name = this._name, id = this._id;
	if (typeof select !== "function") select = selectorAll_default(select);
	for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) if (node = group[i]) {
		for (var children = select.call(node, node.__data__, i, group), child, inherit = get(node, id), k = 0, l = children.length; k < l; ++k) if (child = children[k]) schedule_default(child, name, id, k, children, inherit);
		subgroups.push(children);
		parents.push(node);
	}
	return new Transition(subgroups, parents, name, id);
}
//#endregion
//#region node_modules/d3-transition/src/transition/selection.js
var Selection = selection.prototype.constructor;
function selection_default() {
	return new Selection(this._groups, this._parents);
}
//#endregion
//#region node_modules/d3-transition/src/transition/style.js
function styleNull(name, interpolate) {
	var string00, string10, interpolate0;
	return function() {
		var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
		return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate(string00 = string0, string10 = string1);
	};
}
function styleRemove(name) {
	return function() {
		this.style.removeProperty(name);
	};
}
function styleConstant(name, interpolate, value1) {
	var string00, string1 = value1 + "", interpolate0;
	return function() {
		var string0 = styleValue(this, name);
		return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate(string00 = string0, value1);
	};
}
function styleFunction(name, interpolate, value) {
	var string00, string10, interpolate0;
	return function() {
		var string0 = styleValue(this, name), value1 = value(this), string1 = value1 + "";
		if (value1 == null) string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
		return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
	};
}
function styleMaybeRemove(id, name) {
	var on0, on1, listener0, key = "style." + name, event = "end." + key, remove;
	return function() {
		var schedule = set(this, id), on = schedule.on, listener = schedule.value[key] == null ? remove || (remove = styleRemove(name)) : void 0;
		if (on !== on0 || listener0 !== listener) (on1 = (on0 = on).copy()).on(event, listener0 = listener);
		schedule.on = on1;
	};
}
function style_default(name, value, priority) {
	var i = (name += "") === "transform" ? interpolateTransformCss : interpolate_default;
	return value == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove(name)) : typeof value === "function" ? this.styleTween(name, styleFunction(name, i, tweenValue(this, "style." + name, value))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant(name, i, value), priority).on("end.style." + name, null);
}
//#endregion
//#region node_modules/d3-transition/src/transition/styleTween.js
function styleInterpolate(name, i, priority) {
	return function(t) {
		this.style.setProperty(name, i.call(this, t), priority);
	};
}
function styleTween(name, value, priority) {
	var t, i0;
	function tween() {
		var i = value.apply(this, arguments);
		if (i !== i0) t = (i0 = i) && styleInterpolate(name, i, priority);
		return t;
	}
	tween._value = value;
	return tween;
}
function styleTween_default(name, value, priority) {
	var key = "style." + (name += "");
	if (arguments.length < 2) return (key = this.tween(key)) && key._value;
	if (value == null) return this.tween(key, null);
	if (typeof value !== "function") throw new Error();
	return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
}
//#endregion
//#region node_modules/d3-transition/src/transition/text.js
function textConstant(value) {
	return function() {
		this.textContent = value;
	};
}
function textFunction(value) {
	return function() {
		var value1 = value(this);
		this.textContent = value1 == null ? "" : value1;
	};
}
function text_default(value) {
	return this.tween("text", typeof value === "function" ? textFunction(tweenValue(this, "text", value)) : textConstant(value == null ? "" : value + ""));
}
//#endregion
//#region node_modules/d3-transition/src/transition/textTween.js
function textInterpolate(i) {
	return function(t) {
		this.textContent = i.call(this, t);
	};
}
function textTween(value) {
	var t0, i0;
	function tween() {
		var i = value.apply(this, arguments);
		if (i !== i0) t0 = (i0 = i) && textInterpolate(i);
		return t0;
	}
	tween._value = value;
	return tween;
}
function textTween_default(value) {
	var key = "text";
	if (arguments.length < 1) return (key = this.tween(key)) && key._value;
	if (value == null) return this.tween(key, null);
	if (typeof value !== "function") throw new Error();
	return this.tween(key, textTween(value));
}
//#endregion
//#region node_modules/d3-transition/src/transition/transition.js
function transition_default$1() {
	var name = this._name, id0 = this._id, id1 = newId();
	for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) if (node = group[i]) {
		var inherit = get(node, id0);
		schedule_default(node, name, id1, i, group, {
			time: inherit.time + inherit.delay + inherit.duration,
			delay: 0,
			duration: inherit.duration,
			ease: inherit.ease
		});
	}
	return new Transition(groups, this._parents, name, id1);
}
//#endregion
//#region node_modules/d3-transition/src/transition/end.js
function end_default() {
	var on0, on1, that = this, id = that._id, size = that.size();
	return new Promise(function(resolve, reject) {
		var cancel = { value: reject }, end = { value: function() {
			if (--size === 0) resolve();
		} };
		that.each(function() {
			var schedule = set(this, id), on = schedule.on;
			if (on !== on0) {
				on1 = (on0 = on).copy();
				on1._.cancel.push(cancel);
				on1._.interrupt.push(cancel);
				on1._.end.push(end);
			}
			schedule.on = on1;
		});
		if (size === 0) resolve();
	});
}
//#endregion
//#region node_modules/d3-transition/src/transition/index.js
var id = 0;
function Transition(groups, parents, name, id) {
	this._groups = groups;
	this._parents = parents;
	this._name = name;
	this._id = id;
}
function transition(name) {
	return selection().transition(name);
}
function newId() {
	return ++id;
}
var selection_prototype = selection.prototype;
Transition.prototype = transition.prototype = {
	constructor: Transition,
	select: select_default,
	selectAll: selectAll_default,
	selectChild: selection_prototype.selectChild,
	selectChildren: selection_prototype.selectChildren,
	filter: filter_default,
	merge: merge_default,
	selection: selection_default,
	transition: transition_default$1,
	call: selection_prototype.call,
	nodes: selection_prototype.nodes,
	node: selection_prototype.node,
	size: selection_prototype.size,
	empty: selection_prototype.empty,
	each: selection_prototype.each,
	on: on_default,
	attr: attr_default,
	attrTween: attrTween_default,
	style: style_default,
	styleTween: styleTween_default,
	text: text_default,
	textTween: textTween_default,
	remove: remove_default,
	tween: tween_default,
	delay: delay_default,
	duration: duration_default,
	ease: ease_default,
	easeVarying: easeVarying_default,
	end: end_default,
	[Symbol.iterator]: selection_prototype[Symbol.iterator]
};
//#endregion
//#region node_modules/d3-transition/src/selection/transition.js
var defaultTiming = {
	time: null,
	delay: 0,
	duration: 250,
	ease: cubicInOut
};
function inherit(node, id) {
	var timing;
	while (!(timing = node.__transition) || !(timing = timing[id])) if (!(node = node.parentNode)) throw new Error(`transition ${id} not found`);
	return timing;
}
function transition_default(name) {
	var id, timing;
	if (name instanceof Transition) id = name._id, name = name._name;
	else id = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
	for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) if (node = group[i]) schedule_default(node, name, id, i, group, timing || inherit(node, id));
	return new Transition(groups, this._parents, name, id);
}
//#endregion
//#region node_modules/d3-transition/src/selection/index.js
selection.prototype.interrupt = interrupt_default;
selection.prototype.transition = transition_default;
//#endregion
export { interrupt_default$1 as t };
