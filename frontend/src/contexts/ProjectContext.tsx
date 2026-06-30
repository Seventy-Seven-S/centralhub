'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useProyectos, type Proyecto } from '@/hooks/useProyectos';
import {
  readStoredProjectId,
  writeStoredProjectId,
  resolveStoredSelection,
} from './projectSelection';

interface ProjectSelectionValue {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedProject: Proyecto | null;
  projects: Proyecto[];
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectSelectionValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projects = [], isLoading } = useProyectos();
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage una vez que la lista de proyectos cargó,
  // resolviendo contra la lista (fallback a "Todos" si el id ya no existe).
  useEffect(() => {
    if (isLoading || hydrated) return;
    const stored = readStoredProjectId(window.localStorage);
    const resolved = resolveStoredSelection(projects, stored);
    if (resolved !== stored) writeStoredProjectId(window.localStorage, resolved);
    setSelectedProjectIdState(resolved);
    setHydrated(true);
  }, [isLoading, hydrated, projects]);

  const setSelectedProjectId = (id: string | null) => {
    setSelectedProjectIdState(id);
    writeStoredProjectId(window.localStorage, id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <ProjectContext.Provider
      value={{ selectedProjectId, setSelectedProjectId, selectedProject, projects, isLoading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectSelection(): ProjectSelectionValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectSelection debe usarse dentro de <ProjectProvider>');
  }
  return ctx;
}
