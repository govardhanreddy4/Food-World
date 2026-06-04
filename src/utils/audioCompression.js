/**
 * Downsamples an audio file to 22050Hz Mono and truncates it to a maximum of 60 seconds.
 * Returns a new Blob containing uncompressed WAV data.
 */
export const compressAudio = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  const MAX_DURATION = 60; // 60 seconds maximum
  const duration = Math.min(audioBuffer.duration, MAX_DURATION);
  const sampleRate = 22050; // Low bitrate
  
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  return audioBufferToWav(renderedBuffer);
};

function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  let pos = 0;

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); 
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); 
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); 
  setUint16(numOfChan * 2); 
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); 

  const channelData = buffer.getChannelData(0);
  let offset = 0;

  while (offset < buffer.length) {
    let sample = Math.max(-1, Math.min(1, channelData[offset]));
    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
    view.setInt16(pos, sample, true);
    pos += 2;
    offset++;
  }
  return new Blob([bufferArray], { type: "audio/wav" });
}
