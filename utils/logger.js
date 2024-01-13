import kleur from 'kleur';
import getArgs from '../lib/getArgs.js';
import getTimestamp from './getTimestamp.js';
const { values: opts } = getArgs;

// Logging function
export default (meta, ...messages) => {
	// Set up timestamp object and level
	const [level, cmd] = meta.split(',');

	if (opts.silent || (level === 'info' && !opts.verbose)) return;

	const levelMap = {
		info: 'blue',
		event: 'dim',
		warn: 'yellow',
		error: 'red',
	};

	messages
		.join(' ')
		.split('\n')
		.forEach((message) => {
			console.log(
				kleur[levelMap[level]](
					`[${getTimestamp()}] ${cmd ? `${cmd}: ${message}` : message}`
				)
			);
		});
};
