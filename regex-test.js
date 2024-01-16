const regex =
	/(?<height>\d+)p @ (?<bitrate>\d+[kM]) using (?<profile>[A-z]+)@(?<level>[\d.]+)/gm;

const str = `2160p/18M using high@5.2, 1440p/10M using high@5.2, 1080p/6M using high@5.1, 720p/3M using high@4.2, 480p/1.5M using high@4.0, 360p/800k using main@3.1, 240p/600k using main@3.1`;

const matches = [];

let results;
while ((results = regex.exec(str)) !== null) {
	matches.push({
		height: Number(results.groups.height),
		bitrate: results.groups.bitrate,
		profile: results.groups.profile,
		level: results.groups.level,
	});
}

console.log(matches);
