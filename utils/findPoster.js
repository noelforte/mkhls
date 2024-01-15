import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny utility to find poster frames within a specified source path
 *
 * @param {fs.PathLike} inputPath A parseable pathname
 * @returns {(string|undefined)} Path to a poster frame, undefined if no path was found.
 */
function findPoster(inputPath) {
	const parsedPath = path.parse(inputPath);
	const imagePattern = /\.(png|webp|jpe?g|tiff?)$/;
	const filteredDirContents = fs
		.readdirSync(parsedPath.dir)
		.filter((item) => item !== parsedPath.base)
		.filter((item) => /^[^.\s].+\.[\d\w]+$/.test(item));

	const otherItemsMatched = filteredDirContents.filter(
		(item) => !imagePattern.test(item)
	);
	const imageItemsMatched = filteredDirContents.filter((item) =>
		imagePattern.test(item)
	);

	if (otherItemsMatched.length > 0) {
		const exactMatch = imageItemsMatched
			.filter((item) => item.includes(parsedPath.name))
			.sort()[0];
		return exactMatch && path.resolve(parsedPath.dir, exactMatch);
	}

	if (imageItemsMatched.length > 0) {
		return path.resolve(parsedPath.dir, imageItemsMatched.sort()[0]);
	}
}

export default findPoster;
