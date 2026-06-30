'use client';

import { useProjectSelection } from '@/contexts/ProjectContext';

export default function ProjectSelector() {
  const { selectedProjectId, setSelectedProjectId, projects, isLoading } = useProjectSelection();

  return (
    <select
      aria-label="Seleccionar proyecto"
      value={selectedProjectId ?? ''}
      onChange={(e) => setSelectedProjectId(e.target.value || null)}
      disabled={isLoading}
      className="w-full text-xs font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer transition"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <option value="">Todos los proyectos</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
