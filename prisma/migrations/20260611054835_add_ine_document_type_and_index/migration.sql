-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'INE';

-- CreateIndex
CREATE INDEX "documents_relatedEntity_relatedEntityId_idx" ON "documents"("relatedEntity", "relatedEntityId");
