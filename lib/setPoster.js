// Given an input path, set the poster frame for the video. Uses sharp and ffmpeg.
import path from 'node/path';
import fs from 'node:fs/promises';

import { cmd, logger } from './helpers';
import sharp from 'sharp';

export default async (poster, sourcePath, outputPath) => {
	if (!poster) {
		await cmd('ffmpeg', ['-ss', '', '-i', sourcePath]);
	}

	if (stats.streams.video && opts.poster) {
		const poster = {
			from: path.resolve(opts.poster),
			to: path.resolve(outputPath, `poster${path.extname(opts.poster)}`),
		};
		logger('info', `copying poster frame from ${poster.from} to ${poster.to}`);
		await fs.cp(poster.from, poster.to);
	}
};
