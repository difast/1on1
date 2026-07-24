import { useState, useRef, useEffect, useCallback } from 'react'

// Единый переиспользуемый редактор фото профиля: загрузка файла + позиция (сдвиг)
// + масштаб (зум) + кадрирование в круглой рамке аватара. Используется и при
// регистрации, и при замене из левого меню — одна логика, без дублей.
//
// Реализация на canvas без внешних библиотек — надёжно рендерится в модалке и не
// зависит от подключения чужих стилей (прежний react-easy-crop давал «чёрный
// экран», когда его CSS не подхватывался).

const VIEW = 280   // размер области редактирования (px)
const OUT = 256    // размер итогового аватара (px)

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

export default function AvatarCropModal({ open, onSave, onClose, title = 'Фото профиля', saving = false }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [img, setImg] = useState(null)        // загруженный Image
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })  // координаты верхнего-левого угла отрисовки
  const [processing, setProcessing] = useState(false)
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  const drag = useRef(null)

  const busy = saving || processing

  // Базовый масштаб «cover» — при zoom=1 изображение полностью покрывает область.
  const coverScale = img ? Math.max(VIEW / img.width, VIEW / img.height) : 1
  const eff = coverScale * zoom
  const drawW = img ? img.width * eff : 0
  const drawH = img ? img.height * eff : 0

  const clampOffset = useCallback((off, dW, dH) => ({
    x: clamp(off.x, VIEW - dW, 0),
    y: clamp(off.y, VIEW - dH, 0),
  }), [])

  // Загрузка выбранного файла в Image + центрирование.
  useEffect(() => {
    if (!imageSrc) { setImg(null); return }
    const i = new Image()
    i.onload = () => {
      setImg(i)
      const cs = Math.max(VIEW / i.width, VIEW / i.height)
      const dW = i.width * cs, dH = i.height * cs
      setZoom(1)
      setOffset({ x: (VIEW - dW) / 2, y: (VIEW - dH) / 2 })
    }
    i.src = imageSrc
  }, [imageSrc])

  // Перерисовка предпросмотра.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !img) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, VIEW, VIEW)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, VIEW, VIEW)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, offset.x, offset.y, drawW, drawH)
  }, [img, offset, drawW, drawH])

  if (!open) return null

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = (ev) => setImageSrc(ev.target.result)
    r.readAsDataURL(f)
    e.target.value = ''
  }

  // Перетаскивание (сдвиг позиции).
  const onPointerDown = (e) => {
    if (!img) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.sx
    const dy = e.clientY - drag.current.sy
    setOffset(clampOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy }, drawW, drawH))
  }
  const onPointerUp = () => { drag.current = null }

  // Зум с сохранением центра области.
  const onZoom = (z) => {
    if (!img) { setZoom(z); return }
    const effOld = coverScale * zoom
    const effNew = coverScale * z
    // Точка изображения под центром вьюпорта до зума:
    const cImgX = (VIEW / 2 - offset.x) / effOld
    const cImgY = (VIEW / 2 - offset.y) / effOld
    const nx = VIEW / 2 - cImgX * effNew
    const ny = VIEW / 2 - cImgY * effNew
    const dW = img.width * effNew, dH = img.height * effNew
    setZoom(z)
    setOffset(clampOffset({ x: nx, y: ny }, dW, dH))
  }

  const handleSave = async () => {
    if (!img) return
    setProcessing(true)
    try {
      const out = document.createElement('canvas')
      out.width = OUT; out.height = OUT
      const ctx = out.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      const sf = OUT / VIEW
      ctx.drawImage(img, offset.x * sf, offset.y * sf, drawW * sf, drawH * sf)
      const b64 = out.toDataURL('image/jpeg', 0.85)
      await onSave(b64)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="overlay-center" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '92vw' }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" aria-label="Закрыть" onClick={onClose} disabled={busy}>×</button>
        </div>

        {!img ? (
          <div style={{ padding: '24px 12px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
              Выберите изображение — затем можно сдвинуть и приблизить его перед сохранением.
            </p>
            <button type="button" className="btn btn-accent" onClick={() => fileRef.current?.click()}>
              Выбрать файл
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative', width: VIEW, height: VIEW, maxWidth: '100%', borderRadius: 12, overflow: 'hidden', touchAction: 'none' }}>
                <canvas
                  ref={canvasRef}
                  width={VIEW}
                  height={VIEW}
                  style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                {/* Круглая рамка-подсказка (затемняем всё за пределами круга) */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)',
                  border: '2px solid rgba(255,255,255,0.8)', pointerEvents: 'none',
                }} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', margin: '0 0 6px' }}>
              Перетащите фото, чтобы сдвинуть. Ползунок — масштаб.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 14px' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Масштаб</span>
              <input
                type="range" min={1} max={3} step={0.01} value={zoom}
                onChange={(e) => onZoom(Number(e.target.value))}
                style={{ flex: 1 }} aria-label="Масштаб"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-accent" style={{ flex: 2 }} onClick={handleSave} disabled={busy}>
                {busy ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => fileRef.current?.click()} disabled={busy}>
                Другое фото
              </button>
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
      </div>
    </div>
  )
}
