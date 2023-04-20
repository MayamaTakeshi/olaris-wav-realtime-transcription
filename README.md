# olaris-wav-realtime-transcription
This is a node.js module used to transcribe wav files using Olaris v2 realtime transcription service

# Sample usage
```
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

OWRT(uuid, reader, wav_file, language, config, context)
.then(transcription => {
    console.log(transcription)
    process.exit(0)
})
```
