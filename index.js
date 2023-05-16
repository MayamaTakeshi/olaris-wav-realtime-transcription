const OlarisSpeechRecogStream = require('olaris-speech-recog-stream')

const encodings = {
    1: 'LINEAR16',
    6: 'ALAW',
    7: 'MULAW'
}

function request_transcription(reader, wav_file, language, config, context, log) {
    return new Promise((resolve, reject) => {

    var canWrite = true

    var ola_ready = false

    var aborted = false

    var ola_stream

    var process_error = (reject, err) => {
        log.error(`process_error got ${err}`)
        if(ola_stream) {
            ola_stream.end()
        }
        aborted = true
        reject(err)
    }

    try {
        var bufferLength = 0
        // the "format" event gets emitted at the end of the WAVE header
        reader.on('format', function (format) {
            log.info(`format: ${JSON.stringify(format)}`)

            if(format.sampleRate != 16000 && format.sampleRate != 8000) {
                process_error(reject, `Unexpected sampleRate=${format.sampleRate}. Only 16000 and 8000 are allowed`)
            }
            config.sampling_rate = format.sampleRate

            if(format.channels != 1) {
                process_error(reject, `Unexpected num_channels=${format.channels}. Only one channel is allowed`)
            }

            if(![1,6,7].includes(format.audioFormat)) {
                reject(reject, `Unsupported audioFormat {format.audioFormat}`)
            }
            config.encoding = encodings[format.audioFormat]

            bufferLength = config.sampling_rate == 16000 ? 640 : 160

            var acc = Buffer.alloc(0)

            const MIN_LENGTH = 2730

            reader.on('data', data => {
                //log.info(`wav data: ${JSON.stringify(data)`)
                acc = Buffer.concat([acc, data])
                var len = Buffer.byteLength(acc)
                if(len >= MIN_LENGTH) {
                    //log.info(`Sending data to olaris (length: ${len}) ola_ready=${ola_ready}`) 
                    ola_stream.write(acc)
                    acc = Buffer.alloc(0)
                }
            })

            reader.on('end', () => {
                log.info('reader end')
                //log(acc)
                ola_stream.write(acc)
                acc = Buffer.alloc(0)
                log.info("sending request_flush")
                ola_stream.request_flush() 
            })

            try {
                ola_stream = new OlarisSpeechRecogStream(language, context, config, log)
            } catch (err) {
                process_error(reject, err)
                return
            }

            ola_stream.on('ready', () => {
                log.info('ola_stream ready')
                ola_ready = true
                const start = new Date()

                ola_stream.on('data', data => {
                    log.info(`ola_stream Channel=1 Transcription: ${data.transcript}`)
                    const now = new Date()
                    const diff = (now - start) / 1000
                    transcription.push({side: "", transcript: data.transcript, endTime: diff})
                })

                ola_stream.on('close', () => {
                    log.info(`ola_stream close`)
                })

                reader.on('drain', () => {
                    log.info('reader drain')
                    canWrite = true
                })
            })

            ola_stream.on('error', err => {
                process_error(reject, err)
            })
        })

        reader.on('close', function() {
            log.info("reader close")
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
              process_error(reject, "could not read 44 bytes of wav header")
          }

          reader.write(b.buffer)

          var wait_count = 0
          while(!ola_ready) {
             if(aborted) {
               return
             }
             if(wait_count > 2000) {
                 // we will wait for about 200 seconds (100 ms * 2000)
                 process_error(reject, "ola_ready timeout")
                 return
             }
             await setTimeoutAsync(100)
             wait_count++
             log.info(`wait_count=${wait_count} ola_ready=${ola_ready}`)
          }

          const buffer = Buffer.alloc(bufferLength)

          offset += b.bytesRead
          b = await readAsync(fd, buffer, 0, buffer.length, offset)
          while (b.bytesRead > 0) {
             if(aborted) {
               return
             }

            if(b.bytesRead != bufferLength) {
                //ignore last data if it doesn't fill the full buffer as it causes crash.
                break
            }

            if(!canWrite) {
                await setTimeoutAsync(20)
            }

            //log.info("write to reader")
            canWrite = reader.write(b.buffer)
            if(!canWrite) {
                log.info("canWrite is false")
                continue
            }
            await setTimeoutAsync(20) // simulate RTP reception every 20 milliseconds
            offset += b.bytesRead
            b = await readAsync(fd, buffer, 0, buffer.length, offset)
          }

          reader.end() // this will cause reader to emit 'end' and we will use it to ask ola to flush any stored partials.

          await setTimeoutAsync(5 * 1000)

          ola_stream.end()

          resolve(transcription)
        }

        doit(wav_file)
    } catch (err) {
        process_error(reject, err)
    }
})
}

module.exports = request_transcription
