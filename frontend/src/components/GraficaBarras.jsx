function compacto(n) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return n ? '$' + n : '';
}

export default function GraficaBarras({ datos = [], alto = 110 }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const anchoBarra = 38, sep = 14, base = 20, topGap = 16;
  const ancho = datos.length * (anchoBarra + sep) + sep;
  return (
    <svg width="100%" viewBox={`0 0 ${ancho} ${alto + base + topGap}`} role="img" aria-label="Gráfica de barras">
      {datos.map((d, i) => {
        const h = Math.round((d.valor / max) * alto);
        const x = sep + i * (anchoBarra + sep);
        const y = topGap + (alto - h);
        return (
          <g key={i}>
            <text x={x + anchoBarra / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0f172a">{compacto(d.valor)}</text>
            <rect x={x} y={y} width={anchoBarra} height={h} rx="4" fill="#2563eb" />
            <text x={x + anchoBarra / 2} y={topGap + alto + 13} textAnchor="middle" fontSize="9" fill="#64748b">{d.etiqueta}</text>
          </g>
        );
      })}
    </svg>
  );
}
