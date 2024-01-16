/**
 * Exports a mini-class to handle building an arg list
 * for ffmpeg, uses execa to execute and handle output
 */

// Internals
import path from 'node:path';
import process from 'node:process';
import cp from 'node:child_process';

// Locals
import ffprobe from './ffprobe.js';
import convertTime from '../utils/convertTime.js';
import logger from '../utils/logger.js';
import cli from './cli.js';
import kleur from 'kleur';

class FFmpeg {
	constructor() {
		this.meta = {};
		this.arglist = [];
	}

	/**
	 * @returns {VideoSpecs}
	 * @typedef {object} VideoSpecs
	 * @property {number} frameCount
	 * @property {number} fpsDecimal
	 * @property {object} streams
	 * @property {object} streams.video
	 * @property {object} streams.audio
	 * @property {object} format
	 * Metadata specs as an object */
	get specs() {
		if (Object.keys(this.meta).length === 0) {
			throw new Error(
				'No data to show, did you remember to call `loadMeta()`?'
			);
		}

		return this.meta.data;
	}

	/**
	 * @param {fs.PathLike} input
	 * Path to load data object from */
	loadMeta(input) {
		const data = ffprobe(input);
		const parsedPath = path.parse(input);

		const slug = parsedPath.name
			.toLowerCase()
			.replaceAll(/[-_\s]+/g, '-')
			.replaceAll(/[^A-z0-9-]/g, '');

		this.meta = {
			slug,
			data,
			path: parsedPath,
		};

		return this;
	}

	/**
	 * @param {...string} args
	 * One or more arguments to add */
	addArguments(...args) {
		this.arglist.push(...args);

		return this;
	}

	/**
	 * Path of input to pass to ffmpeg
	 * @param {object} options
	 * Object of ffmpeg options to add. Boolean elements will be added as-is
	 * @example
	 * ```
	 * addArgumentSet('/path/to/input', {
	 *   a: 'value'
	 *   b: ['value1', 'value2']
	 *   '-singleOpt': true
	 * })
	 * //=> ['-a', 'value', '-b', 'value1,value2', '-singleOpt']
	 * ``` */
	addArgumentSet(options) {
		Object.entries(options).forEach(([k, v]) => {
			if (typeof v == 'boolean' && v) {
				this.addArguments(k);
			} else if (typeof v != 'boolean') {
				this.addArguments(`-${k}`, String(v));
			}
		});
		return this;
	}

	/**
	 * @returns {Promise}
	 */
	async start() {
		const args = [
			'-loglevel',
			'error',
			'-hide_banner',
			'-stats_period',
			'0.25',
			'-progress',
			'-',
			...this.arglist.flat(Infinity).filter(Boolean),
		];

		if (cli.opts.verbose) {
			logger(
				'info',
				`$ ffmpeg ${args
					.map((arg) => (/^[A-z0-9]+$/.test(arg) ? arg : `"${arg}"`))
					.join(' ')}`
			);
		}

		return new Promise((resolve, reject) => {
			const ffmpegProcess = cp.spawn('ffmpeg', [
				'-loglevel',
				'error',
				'-hide_banner',
				'-stats_period',
				'0.25',
				'-progress',
				'-',
				...args,
			]);

			ffmpegProcess.stdout.on('data', (data) => {
				// Convert output to strings
				const output = data.toString().match(/out_time=([\d:.]+)/);
				if (output) {
					const percentage =
						(convertTime.toSeconds(output[1]) / this.specs.format.duration) *
						100;

					process.stdout.clearLine(0);
					process.stdout.cursorTo(0);
					process.stdout.write(
						`Encoding '${this.meta.path.base}' ${percentage.toFixed()}%`
					);
				}
			});

			ffmpegProcess.stderr.on('data', (data) => {
				const output = String(data);
				if (output.includes('already exists. Exiting.')) {
					reject(new Error(`ffmpeg: ${data}`));
				} else {
					logger('warn,ffmpeg', output);
				}
			});

			ffmpegProcess.on('exit', (code) => {
				if (code === 0) {
					process.stdout.clearLine(0);
					process.stdout.cursorTo(0);
					process.stdout.write(
						kleur.green(`Encoding '${this.meta.path.base}' [COMPLETE]\n`)
					);
					resolve('[Process completed]');
				} else {
					reject(new Error(`Process failed with ${ffmpegProcess.stderr}`));
				}
			});
		});
	}
}

export default FFmpeg;
