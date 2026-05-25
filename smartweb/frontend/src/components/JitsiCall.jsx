import { useEffect, useRef, useState } from 'react'
import { updateMeeting, uploadRecording } from '../api/client'

export default function JitsiCall({ roomName, userName, meetingId, onClose }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startTimeRef = useRef(null)
  const analyticsRef = useRef({ participants: [], speakingEvents: [], muteEvents: [] })
  const closedRef = useRef(false)
  const handleCloseRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [uploadingRecording, setUploadingRecording] = useState(false)

  const handleClose = async () => {
    if (closedRef.current) return
    closedRef.current = true

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

    const analytics = { ...analyticsRef.current, duration_seconds: duration }

    if (meetingId) {
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
    }

    onClose({ duration_seconds: duration, analytics })
  }

  // Keep ref fresh so stale closures in event listeners always call latest version
  handleCloseRef.current = handleClose

  useEffect(() => {
    const init = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return

      const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName,
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
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [roomName, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111827',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.7)',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.9 }}>
          📹 Созвон
        </span>
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
            Открыть дашборд в новой вкладке ↗
          </button>
          <button
            onClick={() => handleCloseRef.current()}
            style={{
              background: 'rgba(220,38,38,0.8)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 12, padding: '5px 12px',
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
          background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 13,
          padding: '8px 20px', borderRadius: 20, pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          ⏳ Загружаем запись для анализа...
        </div>
      )}
    </div>
  )
}
