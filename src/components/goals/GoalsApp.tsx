// src/components/goals/GoalsApp.tsx

import { useState } from "react";
import { GoalsToolbar } from "./GoalsToolbar";
import { GoalsList } from "./GoalsList";
import { GoalCreateModal } from "./GoalCreateModal";
import { GoalArchiveConfirm } from "./GoalArchiveConfirm";
import { useGoalsFiltersState } from "./hooks/useGoalsFiltersState";
import { useGoalsData } from "./hooks/useGoalsData";
import { useGoalTypesData } from "./hooks/useGoalTypesData";
import { useGoalMutations } from "./hooks/useGoalMutations";
import type { CreateGoalPayload } from "./types";
import { mapGoalDtoToVm } from "./mappers";

/**
 * GoalsApp - główny kontener widoku Cele
 *
 * Odpowiedzialności:
 * - Zarządzanie stanem filtrowania (archiwalne)
 * - Pobieranie danych (cele, typy celów)
 * - Obsługa mutacji (create, update, archive)
 * - Zarządzanie modalami
 * - Optimistic updates z rollbackiem
 */
export function GoalsApp() {
  // Stan filtrów
  const { filters, setIncludeArchived } = useGoalsFiltersState();

  // Dane
  const { items, isLoading, error, count, refetch } = useGoalsData(filters);
  const { goalTypes } = useGoalTypesData();

  // Mutacje
  const { createGoal, updateGoal, archiveGoal, isCreating, isArchiving } = useGoalMutations();

  // Stan modalów
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [archiveModalState, setArchiveModalState] = useState<{ open: boolean; goalId: string | null; goalName: string }>({
    open: false,
    goalId: null,
    goalName: "",
  });

  // Stan optimistic updates
  const [priorityUpdatingGoalId, setPriorityUpdatingGoalId] = useState<string | null>(null);

  // Błędy serwera
  const [createError, setCreateError] = useState<string | null>(null);

  // ============================================================================
  // Handlers - Create
  // ============================================================================

  const handleCreateClick = () => {
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (payload: CreateGoalPayload) => {
    setCreateError(null);

    try {
      const newGoal = await createGoal(payload);
      // Sukces - zamknij modal i odśwież listę
      setIsCreateModalOpen(false);
      refetch();
      // Opcjonalnie: optimistic add (ale refetch jest prostsze i spójniejsze)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się utworzyć celu";
      setCreateError(message);
      throw err; // Modal pozostaje otwarty
    }
  };

  // ============================================================================
  // Handlers - Priority Toggle (optimistic)
  // ============================================================================

  const handleTogglePriority = async (id: string, next: boolean) => {
    setPriorityUpdatingGoalId(id);

    try {
      const updated = await updateGoal(id, { is_priority: next });
      // Sukces - odśwież listę (backend atomowo zmienia priorytet)
      refetch();
    } catch (err) {
      // Błąd - pokaż komunikat (można dodać toast)
      console.error("Failed to toggle priority:", err);
      alert(err instanceof Error ? err.message : "Nie udało się zmienić priorytetu");
    } finally {
      setPriorityUpdatingGoalId(null);
    }
  };

  // ============================================================================
  // Handlers - Archive
  // ============================================================================

  const handleArchiveClick = (id: string) => {
    const goal = items.find((item) => item.id === id);
    if (!goal) return;

    setArchiveModalState({
      open: true,
      goalId: id,
      goalName: goal.name,
    });
  };

  const handleArchiveConfirm = async () => {
    if (!archiveModalState.goalId) return;

    try {
      await archiveGoal(archiveModalState.goalId);
      // Sukces - zamknij modal i odśwież listę
      setArchiveModalState({ open: false, goalId: null, goalName: "" });
      refetch();
    } catch (err) {
      // Błąd - pokazujemy alert
      const message = err instanceof Error ? err.message : "Nie udało się zarchiwizować celu";
      alert(message);
      // Modal pozostaje otwarty, ale można go zamknąć ręcznie
    }
  };

  const handleArchiveModalClose = () => {
    if (!isArchiving) {
      setArchiveModalState({ open: false, goalId: null, goalName: "" });
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  // Obliczanie liczby zarchiwizowanych celów
  const archivedCount = items.filter((item) => item.archived_at !== null).length;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Toolbar */}
      <GoalsToolbar
        includeArchived={filters.include_archived}
        onToggleArchived={setIncludeArchived}
        onCreateClick={handleCreateClick}
        totalCount={count}
        archivedCount={archivedCount}
      />

      {/* Lista celów */}
      <GoalsList
        items={items}
        isLoading={isLoading}
        error={error}
        hasFilters={filters.include_archived}
        onTogglePriority={handleTogglePriority}
        onArchiveClick={handleArchiveClick}
        onCreateGoal={handleCreateClick}
        onRetry={refetch}
        priorityUpdatingGoalId={priorityUpdatingGoalId}
      />

      {/* Modal tworzenia */}
      <GoalCreateModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        goalTypes={goalTypes}
        onSubmit={handleCreateSubmit}
        isSubmitting={isCreating}
        serverError={createError}
      />

      {/* Modal archiwizacji */}
      <GoalArchiveConfirm
        open={archiveModalState.open}
        onOpenChange={handleArchiveModalClose}
        onConfirm={handleArchiveConfirm}
        isSubmitting={isArchiving}
        goalName={archiveModalState.goalName}
      />
    </div>
  );
}

