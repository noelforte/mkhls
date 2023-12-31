#!/usr/bin/env node

/**
 * Script to convert a video into a set of files to play using HLS.
 */

// Import modules
import process from 'node:process';
import path from 'node:path';
import childProcess from 'node:child_process';

try {
  // Define encode options
  const encodeOptions = {
    hls: {
      type: 'mpegts',
      interval: 6,
      segmentNames: '{resolution}p_{index}',
      mainPlaylist: 'index.m3u8',
      noCodecs: true,
    },
    video: {
      codec: 'h264',
      resolutons: [
        { height: 2160, bitrate: '18000k', profile: 'high@5.2' },
        { height: 1440, bitrate: '10000k', profile: 'high@5.2' },
        { height: 1080, bitrate: '6000k', profile: 'high@5.1' },
        { height: 720, bitrate: '3000k', profile: 'high@4.2' },
        { height: 480, bitrate: '1500k', profile: 'high@4.0' },
        { height: 360, bitrate: '800k', profile: 'main@3.1' },
        { height: 240, bitrate: '600k', profile: 'main@3.1' },
      ],
    },
    audio: {
      mute: false,
      codec: 'aac',
      bitrate: '128k',
    },
  };

  // Extract path to compute
  const sourcePath = path.resolve(process.argv[2]);
  const parsedPath = path.parse(sourcePath);
} catch (error) {
  console.error(error);
}
