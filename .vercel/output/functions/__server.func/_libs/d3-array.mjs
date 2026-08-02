//#region node_modules/d3-array/src/max.js
function max(values, valueof) {
	let max;
	if (valueof === void 0) {
		for (const value of values) if (value != null && (max < value || max === void 0 && value >= value)) max = value;
	} else {
		let index = -1;
		for (let value of values) if ((value = valueof(value, ++index, values)) != null && (max < value || max === void 0 && value >= value)) max = value;
	}
	return max;
}
//#endregion
//#region node_modules/d3-array/src/min.js
function min(values, valueof) {
	let min;
	if (valueof === void 0) {
		for (const value of values) if (value != null && (min > value || min === void 0 && value >= value)) min = value;
	} else {
		let index = -1;
		for (let value of values) if ((value = valueof(value, ++index, values)) != null && (min > value || min === void 0 && value >= value)) min = value;
	}
	return min;
}
//#endregion
//#region node_modules/d3-array/src/sum.js
function sum(values, valueof) {
	let sum = 0;
	if (valueof === void 0) {
		for (let value of values) if (value = +value) sum += value;
	} else {
		let index = -1;
		for (let value of values) if (value = +valueof(value, ++index, values)) sum += value;
	}
	return sum;
}
//#endregion
export { min as n, max as r, sum as t };
