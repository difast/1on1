import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
// Обязательный стиль библиотеки: без него контейнер кроппера не позиционируется
// и область показывается чёрной (баг «чёрный экран при изменении фото»).
import 'react-easy-crop/react-easy-crop.css'

// Единый переиспользуемый редактор фото профиля: загрузка файла + позиция (сдвиг)
// + масштаб (зум) + кадрирование в круглой рамке аватара. Используется и при
// регистрации, и при замене из левого меню — одна логика, без дублей.

// Обрезка выбранной области (в натуральных пикселях изображения) в квадрат size×size.
async function getCroppedBase64(imageSrc, cropPixels, size = 256) {
  const image = await new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, size, size,
  )
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function AvatarCropModal({ open, initialImage = null, onSave, onClose, title = 'Фото профиля', saving = false }) {
  const [imageSrc, setImageSrc] = useState(initialImage)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState(null)
  const [processing, setProcessing] = useState(false)
  const fileRef = useRef(null)

  if (!open) return null

  const busy = saving || processing

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = (ev) => { setImageSrc(ev.target.result); setZoom(1); setCrop({ x: 0, y: 0 }); setPixels(null) }
    r.readAsDataURL(f)
    e.target.value = ''  // позволяем выбрать тот же файл повторно
  }

  const onCropComplete = useCallback((_area, areaPixels) => setPixels(areaPixels), [])

  const handleSave = async () => {
    if (!imageSrc || !pixels) return
    setProcessing(true)
    try {
      const b64 = await getCroppedBase64(imageSrc, pixels)
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

        {!imageSrc ? (
          <div style={{ padding: '28px 12px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
              Выберите изображение — затем можно сдвинуть и приблизить его перед сохранением.
            </p>
            <button type="button" className="btn btn-accent" onClick={() => fileRef.current?.click()}>
              Выбрать файл
            </button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', height: 300, background: '#0f172a', borderRadius: 12, overflow: 'hidden' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', margin: '10px 0 4px' }}>
              Перетащите фото, чтобы сдвинуть. Ползунок — масштаб.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 14px' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Масштаб</span>
              <input
                type="range" min={1} max={3} step={0.01} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1 }} aria-label="Масштаб"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-accent" style={{ flex: 2 }} onClick={handleSave} disabled={busy || !pixels}>
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
