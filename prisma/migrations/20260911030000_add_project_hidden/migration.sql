-- Estatus HIDDEN: retira un proyecto de la operación sin borrarlo.
-- No aparece en selectores ni listados y, sobre todo, NO suma en ningún total
-- de dinero. Los datos quedan intactos; se revierte cambiando el estatus.
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'HIDDEN';
