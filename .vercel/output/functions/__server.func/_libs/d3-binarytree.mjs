//#region node_modules/d3-binarytree/src/add.js
function add_default(d) {
	const x = +this._x.call(null, d);
	return add(this.cover(x), x, d);
}
function add(tree, x, d) {
	if (isNaN(x)) return tree;
	var parent, node = tree._root, leaf = { data: d }, x0 = tree._x0, x1 = tree._x1, xm, xp, right, i, j;
	if (!node) return tree._root = leaf, tree;
	while (node.length) {
		if (right = x >= (xm = (x0 + x1) / 2)) x0 = xm;
		else x1 = xm;
		if (parent = node, !(node = node[i = +right])) return parent[i] = leaf, tree;
	}
	xp = +tree._x.call(null, node.data);
	if (x === xp) return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
	do {
		parent = parent ? parent[i] = new Array(2) : tree._root = new Array(2);
		if (right = x >= (xm = (x0 + x1) / 2)) x0 = xm;
		else x1 = xm;
	} while ((i = +right) === (j = +(xp >= xm)));
	return parent[j] = node, parent[i] = leaf, tree;
}
function addAll(data) {
	if (!Array.isArray(data)) data = Array.from(data);
	const n = data.length;
	const xz = new Float64Array(n);
	let x0 = Infinity, x1 = -Infinity;
	for (let i = 0, x; i < n; ++i) {
		if (isNaN(x = +this._x.call(null, data[i]))) continue;
		xz[i] = x;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
	}
	if (x0 > x1) return this;
	this.cover(x0).cover(x1);
	for (let i = 0; i < n; ++i) add(this, xz[i], data[i]);
	return this;
}
//#endregion
//#region node_modules/d3-binarytree/src/cover.js
function cover_default(x) {
	if (isNaN(x = +x)) return this;
	var x0 = this._x0, x1 = this._x1;
	if (isNaN(x0)) x1 = (x0 = Math.floor(x)) + 1;
	else {
		var z = x1 - x0 || 1, node = this._root, parent, i;
		while (x0 > x || x >= x1) {
			i = +(x < x0);
			parent = new Array(2), parent[i] = node, node = parent, z *= 2;
			switch (i) {
				case 0:
					x1 = x0 + z;
					break;
				case 1: x0 = x1 - z;
			}
		}
		if (this._root && this._root.length) this._root = node;
	}
	this._x0 = x0;
	this._x1 = x1;
	return this;
}
//#endregion
//#region node_modules/d3-binarytree/src/data.js
function data_default() {
	var data = [];
	this.visit(function(node) {
		if (!node.length) do
			data.push(node.data);
		while (node = node.next);
	});
	return data;
}
//#endregion
//#region node_modules/d3-binarytree/src/extent.js
function extent_default(_) {
	return arguments.length ? this.cover(+_[0][0]).cover(+_[1][0]) : isNaN(this._x0) ? void 0 : [[this._x0], [this._x1]];
}
//#endregion
//#region node_modules/d3-binarytree/src/half.js
function half_default(node, x0, x1) {
	this.node = node;
	this.x0 = x0;
	this.x1 = x1;
}
//#endregion
//#region node_modules/d3-binarytree/src/find.js
function find_default(x, radius) {
	var data, x0 = this._x0, x1, x2, x3 = this._x1, halves = [], node = this._root, q, i;
	if (node) halves.push(new half_default(node, x0, x3));
	if (radius == null) radius = Infinity;
	else {
		x0 = x - radius;
		x3 = x + radius;
	}
	while (q = halves.pop()) {
		if (!(node = q.node) || (x1 = q.x0) > x3 || (x2 = q.x1) < x0) continue;
		if (node.length) {
			var xm = (x1 + x2) / 2;
			halves.push(new half_default(node[1], xm, x2), new half_default(node[0], x1, xm));
			if (i = +(x >= xm)) {
				q = halves[halves.length - 1];
				halves[halves.length - 1] = halves[halves.length - 1 - i];
				halves[halves.length - 1 - i] = q;
			}
		} else {
			var d = Math.abs(x - +this._x.call(null, node.data));
			if (d < radius) {
				radius = d;
				x0 = x - d;
				x3 = x + d;
				data = node.data;
			}
		}
	}
	return data;
}
//#endregion
//#region node_modules/d3-binarytree/src/remove.js
function remove_default(d) {
	if (isNaN(x = +this._x.call(null, d))) return this;
	var parent, node = this._root, retainer, previous, next, x0 = this._x0, x1 = this._x1, x, xm, right, i, j;
	if (!node) return this;
	if (node.length) while (true) {
		if (right = x >= (xm = (x0 + x1) / 2)) x0 = xm;
		else x1 = xm;
		if (!(parent = node, node = node[i = +right])) return this;
		if (!node.length) break;
		if (parent[i + 1 & 1]) retainer = parent, j = i;
	}
	while (node.data !== d) if (!(previous = node, node = node.next)) return this;
	if (next = node.next) delete node.next;
	if (previous) return next ? previous.next = next : delete previous.next, this;
	if (!parent) return this._root = next, this;
	next ? parent[i] = next : delete parent[i];
	if ((node = parent[0] || parent[1]) && node === (parent[1] || parent[0]) && !node.length) if (retainer) retainer[j] = node;
	else this._root = node;
	return this;
}
function removeAll(data) {
	for (var i = 0, n = data.length; i < n; ++i) this.remove(data[i]);
	return this;
}
//#endregion
//#region node_modules/d3-binarytree/src/root.js
function root_default() {
	return this._root;
}
//#endregion
//#region node_modules/d3-binarytree/src/size.js
function size_default() {
	var size = 0;
	this.visit(function(node) {
		if (!node.length) do
			++size;
		while (node = node.next);
	});
	return size;
}
//#endregion
//#region node_modules/d3-binarytree/src/visit.js
function visit_default(callback) {
	var halves = [], q, node = this._root, child, x0, x1;
	if (node) halves.push(new half_default(node, this._x0, this._x1));
	while (q = halves.pop()) if (!callback(node = q.node, x0 = q.x0, x1 = q.x1) && node.length) {
		var xm = (x0 + x1) / 2;
		if (child = node[1]) halves.push(new half_default(child, xm, x1));
		if (child = node[0]) halves.push(new half_default(child, x0, xm));
	}
	return this;
}
//#endregion
//#region node_modules/d3-binarytree/src/visitAfter.js
function visitAfter_default(callback) {
	var halves = [], next = [], q;
	if (this._root) halves.push(new half_default(this._root, this._x0, this._x1));
	while (q = halves.pop()) {
		var node = q.node;
		if (node.length) {
			var child, x0 = q.x0, x1 = q.x1, xm = (x0 + x1) / 2;
			if (child = node[0]) halves.push(new half_default(child, x0, xm));
			if (child = node[1]) halves.push(new half_default(child, xm, x1));
		}
		next.push(q);
	}
	while (q = next.pop()) callback(q.node, q.x0, q.x1);
	return this;
}
//#endregion
//#region node_modules/d3-binarytree/src/x.js
function defaultX(d) {
	return d[0];
}
function x_default(_) {
	return arguments.length ? (this._x = _, this) : this._x;
}
//#endregion
//#region node_modules/d3-binarytree/src/binarytree.js
function binarytree(nodes, x) {
	var tree = new Binarytree(x == null ? defaultX : x, NaN, NaN);
	return nodes == null ? tree : tree.addAll(nodes);
}
function Binarytree(x, x0, x1) {
	this._x = x;
	this._x0 = x0;
	this._x1 = x1;
	this._root = void 0;
}
function leaf_copy(leaf) {
	var copy = { data: leaf.data }, next = copy;
	while (leaf = leaf.next) next = next.next = { data: leaf.data };
	return copy;
}
var treeProto = binarytree.prototype = Binarytree.prototype;
treeProto.copy = function() {
	var copy = new Binarytree(this._x, this._x0, this._x1), node = this._root, nodes, child;
	if (!node) return copy;
	if (!node.length) return copy._root = leaf_copy(node), copy;
	nodes = [{
		source: node,
		target: copy._root = new Array(2)
	}];
	while (node = nodes.pop()) for (var i = 0; i < 2; ++i) if (child = node.source[i]) if (child.length) nodes.push({
		source: child,
		target: node.target[i] = new Array(2)
	});
	else node.target[i] = leaf_copy(child);
	return copy;
};
treeProto.add = add_default;
treeProto.addAll = addAll;
treeProto.cover = cover_default;
treeProto.data = data_default;
treeProto.extent = extent_default;
treeProto.find = find_default;
treeProto.remove = remove_default;
treeProto.removeAll = removeAll;
treeProto.root = root_default;
treeProto.size = size_default;
treeProto.visit = visit_default;
treeProto.visitAfter = visitAfter_default;
treeProto.x = x_default;
//#endregion
export { binarytree as t };
