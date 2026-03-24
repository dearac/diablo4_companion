/**
 * Audio Utility — Low-latency Scan Feedback
 * 
 * Assets expected in public/audio/
 */

const audioPool: Record<string, HTMLAudioElement> = {
  shutter: new Audio('/audio/shutter.mp3'),
  success: new Audio('/audio/success.mp3'),
  error: new Audio('/audio/error.mp3')
}

// Pre-load sounds
Object.values(audioPool).forEach(audio => {
  audio.load()
  audio.volume = 0.4
})

/** Plays the shutter sound effect */
export function playShutterSound(): void {
  const audio = audioPool.shutter
  audio.currentTime = 0
  audio.play().catch(() => {})
}

/** Plays the scan success/upgrade chime */
export function playSuccessSound(): void {
  const audio = audioPool.success
  audio.currentTime = 0
  audio.play().catch(() => {})
}

/** Plays the scan error/downgrade alert */
export function playErrorSound(): void {
  const audio = audioPool.error
  audio.currentTime = 0
  audio.play().catch(() => {})
}
