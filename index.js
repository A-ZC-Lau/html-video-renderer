const puppeteer = require('puppeteer');
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const fps = 24;
const width = 1920;
const height = 1080;
const omitBackground = true;
const numberOfConcurrency = require('os').cpus().length;
// const numberOfConcurrency = 4;
const data_urL_prefix = 'data:image/png;base64,';
const url = "http://localhost:5173/video";
const dirname = "temp_images"
const outputFileName = "test.mov";

process.setMaxListeners(numberOfConcurrency)

/**
 * @param {number} startIndex starting index, used as start value for incrementing
 */
async function DOWNLOAD_AND_SAVE_IMAGES (startIndex) {
	const browser = await puppeteer.launch({
		headless : 'new',
		args: ['--no-sandbox', '--disable-dev-shm-usage'],
	});
	const page = await browser.newPage();
	await page.goto(url, { waitUntil: 'load' })
	// this waits until the "getInfo" function exists which means "seekFrame" will also exist
	const info = await page.evaluate(`(async () => {
        let deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          if (typeof getInfo === 'function') {
            break
          }
          await new Promise(r => setTimeout(r, 1000))
        }
        const info = await getInfo()
        if (!info.width || !info.height) {
          Object.assign(info, {
            width: document.querySelector('#scene').offsetWidth,
            height: document.querySelector('#scene').offsetHeight,
          })
        }
        return info
      })()`);
	await page.setViewport({
		width: width,
		height: height,
		deviceScaleFactor: 1,
    });

	const totalFrames = info.numberOfFrames
	const imagesPerWorker = Math.floor(totalFrames / numberOfConcurrency);
	const remainder = Math.floor(totalFrames % numberOfConcurrency);
	// if the last one, then it should be responsible for the remainder of images
	const amount = startIndex === numberOfConcurrency - 1
		? imagesPerWorker + remainder
		: imagesPerWorker;
	const start = startIndex * imagesPerWorker
	// outputting images to folder
	for (let i = 0; i < amount; i++) {
		const frame = start + i
		const result = await page.evaluate(`seekToFrame(${frame})`);
		const buffer = await page.screenshot({
			clip: { x: 0, y: 0, width: width, height: height },
			omitBackground: omitBackground,
		});
		const name = frame + ".png"
		fs.writeFileSync(path.join(dirname, name), buffer);
	}
	await browser.close();
}

function CREATE_MOVIE () {
	ffmpeg.setFfmpegPath(ffmpegStatic);
	ffmpeg()
		.input(dirname + '/%d.png')
		.inputOptions(
			// "-f", "image2pipe",
			`-r`, fps,
		)
		.videoCodec("qtrle")
		.saveToFile(outputFileName)
		// Log the percentage of work completed
		.on('progress', (progress) => {
			if (progress.percent) {
				console.log(`Processing: ${Math.floor(progress.percent)}% done`);
			}
		})
		// The callback that is run when FFmpeg is finished
		.on('end', () => {
			console.log('FFmpeg has finished.');
		})
		// The callback that is run when FFmpeg encountered an error
		.on('error', (error) => {
			console.error(error);
		});
}
function SETUP () {
	if (!fs.existsSync(dirname)){
		fs.mkdirSync(dirname);
	}
	else {
		fs.rmSync(dirname, { recursive: true, force: true })
		fs.mkdirSync(dirname);
	}
}
async function CONCURRENTLY_DOWNLOAD () {
	const promises = []
	for (let i = 0; i < numberOfConcurrency; i++) {
		promises.push(DOWNLOAD_AND_SAVE_IMAGES(i))
	}
	await Promise.all(promises);
}
async function RUN () {
	SETUP()
	await CONCURRENTLY_DOWNLOAD()
	CREATE_MOVIE()
}
RUN()
