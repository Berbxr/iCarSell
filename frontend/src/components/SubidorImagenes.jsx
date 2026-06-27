import { useRef } from 'react';

export default function SubidorImagenes({ value = [], onChange, max = 8 }) {
  const inputRef = useRef();

  function aDataUrl(file) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
  }

  async function manejar(e) {
    const files = Array.from(e.target.files).slice(0, max - value.length);
    const urls = await Promise.all(files.map(aDataUrl));
    onChange([...value, ...urls]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function quitar(i) { onChange(value.filter((_, idx) => idx !== i)); }

  return (
    <div>
      <div className="thumbs" style={{ marginBottom: value.length ? 8 : 0 }}>
        {value.map((src, i) => (
          <div key={i} className="thumb">
            <img src={src} alt="" />
            <button type="button" onClick={() => quitar(i)}>×</button>
          </div>
        ))}
      </div>
      {value.length < max && <input ref={inputRef} type="file" accept="image/*" multiple onChange={manejar} />}
    </div>
  );
}
