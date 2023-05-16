# olaris-wav-realtime-transcription
This is a node.js module used to transcribe wav files using Olaris v2 realtime transcription service.

Usually, for non-realtime transcription (like from audio recordings) you would the Olaris File API.
However, currently the File API doesn't support Olaris engine v2 that shows superior results when handling AEC (Acoustic Echo Cancellation) processed audio.
So until v2 becomes available in the File API, the alternative is to use the Olaris Realtime API and send the audio as if it were being generated in realtime (respecting tranmission data rates).
This is what this module takes care of.

# Sample usage
```
const tl = require('tracing-log')
const wav = require('wav')
const OWRT = require('olaris-wav-realtime-transcription')

const language = 'ja-JP' // Olaris currently only supports Japanese

const config = {
    api_base: 'realtime.v2.stt.stg.olaris.cloud/real-time-decode',
    product_name: 'YOUR_PRODUCT_NAME,
    organization_id: 'YOUR_ORGANIZATION_ID',
    api_key: 'YOUR_API_KEY',
}

const context = {model_alias: 'model_ja_business'}

const reader = new wav.Reader()

const uuid = 'some-uuid-for-log-correlation'

const wav_file = 'sample.wav'

// you need to provide a log object
const uuid = 'SOME_UNIQUE_IDENTIFIER_FOR_DEBUG_AND_CORRELATION'
const log = tl.gen_logger(uuid)

OWRT(reader, wav_file, language, config, context, log)
.then(transcription => {
    console.log(transcription)
    process.exit(0)
})
```
