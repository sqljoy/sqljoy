import alias from '@rollup/plugin-alias';

export default {
	input: "src/index.js",
	output: {
		file: "dist/bundle.js",
		format: "iife",
		name: "flowstate",
		esModule: false,
	},
	plugins: [alias({
		entries: [
			{ find: "flowstate", replacement: __dirname + "/../../../flowstate/flowstate-client" },
		]
	})],
};