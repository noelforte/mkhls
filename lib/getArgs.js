// Parse aguments from the CLI and export the results
import { parseArgs } from 'node:util';

export default parseArgs({
	args: process.argv.slice(2),
	options: {
		silent: {
			type: 'boolean',
			short: 's',
			default: false,
		},
		verbose: {
			type: 'boolean',
			short: 'v',
			default: false,
		},
		'skip-fallback': {
			type: 'boolean',
			default: false,
		},
		'skip-hls': {
			type: 'boolean',
			default: false,
		},
		'skip-seek-previews': {
			type: 'boolean',
			default: false,
		},
		'dry-run': {
			type: 'boolean',
			default: false,
		},
		output: {
			type: 'string',
			short: 'o',
		},
		'output-prefix': {
			type: 'string',
			default: '',
		},
		overwrite: {
			type: 'boolean',
			default: false,
		},
	},
	allowPositionals: true,
});
