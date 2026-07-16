export function renderRoadmap(container: HTMLElement, titulo: string, detalle: string) {
  container.innerHTML = `
    <div style="margin-bottom:20px"><h1 style="font-size:22px;font-weight:800">${titulo}</h1></div>
    <div class="roadmap-card">
      <div style="font-size:32px;margin-bottom:8px">🚧</div>
      <div style="font-weight:700;color:var(--texto);margin-bottom:6px">Este módulo aún no se ha migrado</div>
      <div style="font-size:13px;max-width:440px;margin:0 auto">${detalle}</div>
    </div>`;
}
