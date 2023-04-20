const OlarisSpeechRecogStream = require('olaris-speech-recog-stream')

const log = (msg) => {
    // not actual error. just avoid writing to stdout
    console.error(msg)
}

const encodings = {
    1: 'LINEAR16',
    6: 'ALAW',
    7: 'MULAW'
}

function request_transcription(uuid, reader, wav_file, language, config, context) {
    return new Promise((resolve, reject) => {

    var canWrite = true

    var ola_ready = false

    var bufferLength = 0
    // the "format" event gets emitted at the end of the WAVE header
    reader.on('format', function (format) {
        log(`format: ${JSON.stringify(format)}`)

        if(format.sampleRate != 16000 && format.sampleRate != 8000) {
            reject(`Unexpected sampleRate=${format.sampleRate}. Only 16000 and 8000 are allowed`)
        }
        config.sampling_rate = format.sampleRate

        if(format.channels != 1) {
            reject(`Unexpected num_channels=${format.channels}. Only one channel is allowed`)
        }

        if(![1,6,7].includes(format.audioFormat)) {
            reject(`Unsupported audioFormat {format.audioFormat}`)
        }
        config.encoding = encodings[format.audioFormat]

        bufferLength = config.sampling_rate == 16000 ? 640 : 160

        var acc = Buffer.alloc(0)

        const MIN_LENGTH = 2730

        reader.on('data', data => {
            //log("wav data:", data)
            acc = Buffer.concat([acc, data])
            var len = Buffer.byteLength(acc)
            if(len >= MIN_LENGTH) {
                //log(`Sending data to olaris (length: ${len}) ola_ready=${ola_ready}`) 
                ola_stream.write(acc)
                acc = Buffer.alloc(0)
            }
        })

        reader.on('end', () => {
            log('reader end')
            //log(acc)
            ola_stream.write(acc)
            acc = Buffer.alloc(0)
            log("sending request_flush")
            ola_stream.request_flush() 
        })

        const ola_stream = new OlarisSpeechRecogStream(uuid, language, context, config)

        ola_stream.on('ready', () => {
            log('ola_stream ready')
            ola_ready = true
            const start = new Date()

            ola_stream.on('data', data => {
                //log(data)
                log(`ola_stream ${uuid} Channel=1 Transcription: ${data.transcript}`)
                const now = new Date()
                const diff = (now - start) / 1000
                transcription.push({side: "", transcript: data.transcript, endTime: diff})
            })

            ola_stream.on('close', () => {
                log(`ola_stream ${uuid} close`)
            })

            ola_stream.on('error', err => {
                log(`ola_stream ${uuid} error ${err}`)
            })

            reader.on('drain', () => {
                log('reader drain')
                canWrite = true
            })

        })
    })

    reader.on('close', function() {
        log("reader close")
    })

    var transcription = []

    const fs = require('fs')
    const util = require('util')
    const openAsync = util.promisify(fs.open)
    const readAsync = util.promisify(fs.read)
    const setTimeoutAsync = util.promisify(setTimeout)

    async function doit(filePath) {
      const fd = await openAsync(filePath, 'r')
      let bytesRead
      let offset = 0

      const buf = Buffer.alloc(44)
      // 44 is the length of the header Wav for PCM.
      // We need to read just the header to force the wav reader to generate the 'format' event.
      // this will trigger creation of ola an when ola gets ready we proceed
      // (obs: we might be able to this subscribing to events)

      var b
      b = await readAsync(fd, buf, 0, buf.length, offset)

      if(b.bytesRead != 44) {
          reject("could not read 44 bytes of wav header")
      }

      reader.write(b.buffer)

      var wait_count = 0
      while(!ola_ready) {
         if(wait_count > 2000) {
             // we will wait for about 200 seconds (100 ms * 2000)
             reject("ola_ready timeout")
         }
         await setTimeoutAsync(100)
         wait_count++
         log(`wait_count=${wait_count} ola_ready=${ola_ready}`)
      }

      const buffer = Buffer.alloc(bufferLength)

      offset += b.bytesRead
      b = await readAsync(fd, buffer, 0, buffer.length, offset)
      //log(b)
      while (b.bytesRead > 0) {
        //log(b)
        if(b.bytesRead != bufferLength) {
            //ignore last data if it doesn't fill the full buffer as it causes crash.
            break
        }

        if(!canWrite) {
            await setTimeoutAsync(20)
        }

        //console.log("write to reader")
        canWrite = reader.write(b.buffer)
        if(!canWrite) {
            log("canWrite is false")
            continue
        }
        await setTimeoutAsync(20) // simulate RTP reception every 20 milliseconds
        offset += b.bytesRead
        b = await readAsync(fd, buffer, 0, buffer.length, offset)
      }

      reader.end() // this will cause reader to emit 'end' and we will use it to ask ola to flush any stored partials.

      await setTimeoutAsync(5 * 1000)

      resolve(transcription)
    }

    doit(wav_file)
})
}

module.exports = request_transcription
