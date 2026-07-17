import { useEffect, useRef, useState } from 'react'
import { updateMeeting, uploadRecording } from '../api/client'

const MIN_ANALYTICS_SECONDS = 600 // 10 minutes

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function JitsiCall({ roomName, userName, meetingId, onClose }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startTimeRef = useRef(null)
  const timerRef = useRef(null)
  const analyticsRef = useRef({ participants: [], speakingEvents: [], muteEvents: [] })
  const closedRef = useRef(false)
  const handleCloseRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [uploadingRecording, setUploadingRecording] = useState(false)

  const effectiveRoomName = roomName || ''

  const handleClose = async () => {
    if (closedRef.current) return
    closedRef.current = true

    if (timerRef.current) clearInterval(timerRef.current)

    const duration = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : 0

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    let blob = null
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      blob = await new Promise(resolve => {
        recorder.addEventListener('stop', () => {
          resolve(
            chunksRef.current.length > 0
              ? new Blob(chunksRef.current, { type: 'audio/webm' })
              : null
          )
        }, { once: true })
        recorder.stop()
      })
    } else if (chunksRef.current.length > 0) {
      blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    }

    if (apiRef.current) {
      try { apiRef.current.dispose() } catch {}
      apiRef.current = null
    }

    if (meetingId) {
      if (duration >= MIN_ANALYTICS_SECONDS) {
        // Full pipeline: completed + analytics + recording upload
        const analytics = { ...analyticsRef.current, duration_seconds: duration }
        try {
          await updateMeeting(meetingId, {
            status: 'completed',
            call_duration_seconds: duration,
            call_analytics: JSON.stringify(analytics),
          })
        } catch (e) {
          console.error('[jitsi] analytics save failed', e)
        }
        if (blob) {
          setUploadingRecording(true)
          try {
            const formData = new FormData()
            formData.append('file', blob, 'recording.webm')
            await uploadRecording(meetingId, formData)
          } catch (e) {
            console.error('[jitsi] recording upload failed', e)
          } finally {
            setUploadingRecording(false)
          }
        }
      } else {
        // Call too short — cancel so it doesn't clutter analytics
        try {
          await updateMeeting(meetingId, { status: 'cancelled' })
        } catch (e) {
          console.error('[jitsi] status cancel failed', e)
        }
      }
    }

    onClose({ duration_seconds: duration })
  }

  handleCloseRef.current = handleClose

  useEffect(() => {
    if (!effectiveRoomName) return

    const init = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return

      const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: effectiveRoomName,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName: userName },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: true,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
        },
      })
      apiRef.current = api

      api.addEventListener('videoConferenceJoined', () => {
        setLoading(false)
        startTimeRef.current = Date.now()
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

        navigator.mediaDevices
          .getUserMedia({ audio: true, video: false })
          .then(stream => {
            streamRef.current = stream
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm'
            const recorder = new MediaRecorder(stream, { mimeType })
            recorderRef.current = recorder
            chunksRef.current = []
            recorder.ondataavailable = e => {
              if (e.data.size > 0) chunksRef.current.push(e.data)
            }
            recorder.start(5000)
          })
          .catch(e => console.warn('[jitsi] mic access denied:', e))
      })

      api.addEventListener('participantJoined', ({ id, displayName }) => {
        analyticsRef.current.participants.push({ id, name: displayName, joined_at: Date.now() })
      })
      api.addEventListener('participantLeft', ({ id }) => {
        analyticsRef.current.participants = analyticsRef.current.participants.map(p =>
          p.id === id ? { ...p, left_at: Date.now() } : p
        )
      })
      api.addEventListener('dominantSpeakerChanged', ({ id }) => {
        analyticsRef.current.speakingEvents.push({ id, ts: Date.now() })
      })
      api.addEventListener('audioMuteStatusChanged', ({ muted }) => {
        analyticsRef.current.muteEvents.push({ muted, ts: Date.now() })
      })
      api.addEventListener('readyToClose', () => {
        handleCloseRef.current()
      })
    }

    if (window.JitsiMeetExternalAPI) {
      init()
    } else {
      const script = document.createElement('script')
      script.src = 'https://meet.jit.si/external_api.js'
      script.async = true
      script.onload = init
      document.head.appendChild(script)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [effectiveRoomName, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  const qualified = elapsed >= MIN_ANALYTICS_SECONDS
  const timerColor = qualified ? '#4ade80' : elapsed >= 300 ? '#fbbf24' : '#9ca3af'
  const progress = Math.min(elapsed / MIN_ANALYTICS_SECONDS, 1)

  return (
    <div data-pit-hide style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111827', display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 48,
        background: 'rgba(0,0,0,0.75)',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Left: title + timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Созвон</span>
          {!loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Progress bar */}
              <div style={{
                width: 80, height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.15)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress * 100}%`, height: '100%',
                  background: timerColor, transition: 'width 1s linear, background 0.5s',
                }} />
              </div>
              <span style={{ color: timerColor, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(elapsed)}
              </span>
              {qualified
                ? <span style={{ fontSize: 11, color: '#4ade80' }}>✓ аналитика</span>
                : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {formatTime(MIN_ANALYTICS_SECONDS - elapsed)} до аналитики
                  </span>
              }
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, color: '#fff', fontSize: 12,
              padding: '5px 12px', cursor: 'pointer',
            }}
          >
            Открыть дашборд ↗
          </button>
          <button
            onClick={() => handleCloseRef.current()}
            style={{
              background: 'rgba(220,38,38,0.8)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 12, padding: '5px 14px',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Завершить
          </button>
        </div>
      </div>

      {/* Jitsi iframe */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />

      {loading && (
        <div style={{
          position: 'absolute', top: 48, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#9ca3af', fontSize: 15, pointerEvents: 'none',
        }}>
          Подключение к комнате...
        </div>
      )}

      {uploadingRecording && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 13,
          padding: '8px 20px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          ⏳ Загружаем запись для анализа...
        </div>
      )}
    </div>
  )
}
