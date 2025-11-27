// src/components/transactions/TransactionsApp.tsx

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { BackdateBanner } from "@/components/dashboard/BackdateBanner";
import { TransactionsFilters } from "./TransactionsFilters";
import { TransactionsListVirtual } from "./TransactionsListVirtual";
import { LoadMoreButton } from "./LoadMoreButton";
import { TransactionFormModal } from "./TransactionFormModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { useTransactionsFiltersState } from "./hooks/useTransactionsFiltersState";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useCategories } from "./hooks/useCategories";
import { useTransactionsData } from "./hooks/useTransactionsData";
import { useTransactionMutations } from "./hooks/useTransactionMutations";
import type { CreateTransactionPayload, UpdateTransactionPayload } from "./types";
import type { TransactionDTO } from "@/types";
import { formatDateShort } from "./utils/groupByDate";

/**
 * TransactionsApp - główny komponent widoku Transakcje
 *
 * Orkiestruje:
 * - Filtry (miesiąc, typ, kategoria, wyszukiwanie)
 * - Listę transakcji z wirtualizacją i grupowaniem po dacie
 * - Paginację keyset (load more)
 * - Modale create/edit/delete
 * - Stany: loading, empty, error
 * - Optimistic updates z rollbackiem
 */
export function TransactionsApp() {
  // Stan filtrów z localStorage
  const {
    filters,
    setMonth,
    setType,
    setCategory,
    setSearch,
    resetFilters,
    goPrevMonth,
    goNextMonth,
    isNextMonthDisabled,
  } = useTransactionsFiltersState();

  // Debounce wyszukiwania (300ms)
  const debouncedSearch = useDebouncedValue(filters.search || "", 300);

  // Kategorie (filtrowane po typie jeśli wybrany)
  const categoriesKind = filters.type === "ALL" ? undefined : filters.type;
  const { categories, isLoading: isLoadingCategories } = useCategories(categoriesKind);

  // Wszystkie kategorie (dla formularza)
  const { categories: allCategories } = useCategories();

  // Dane transakcji z debounced search
  const filtersWithDebouncedSearch = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [filters, debouncedSearch]
  );

  const { sections, isLoading, error, pagination, loadMore, refetch } = useTransactionsData(filtersWithDebouncedSearch);

  // Mutacje
  const { createTransaction, updateTransaction, deleteTransaction, isCreating, isUpdating, isDeleting } =
    useTransactionMutations();

  // Stan modalów
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTransaction, setEditingTransaction] = useState<TransactionDTO | undefined>();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionDTO | undefined>();

  // Stan backdateWarning
  const [showBackdateBanner, setShowBackdateBanner] = useState(false);

  // Handlers - modal formularza
  const handleAddTransaction = () => {
    setFormMode("create");
    setEditingTransaction(undefined);
    setFormModalOpen(true);
  };

  const handleEdit = (id: string) => {
    // Znajdź transakcję w sections
    const transaction = sections.flatMap((s) => s.items).find((item) => item.id === id);
    if (!transaction) return;

    // Konwertuj VM → DTO (potrzebujemy pełnych danych)
    const dto: TransactionDTO = {
      id: transaction.id,
      type: transaction.type,
      category_code: transaction.category_code,
      category_label: transaction.category_label,
      amount_cents: transaction.amount_cents,
      occurred_on: transaction.occurred_on,
      note: transaction.note || null,
      created_at: "", // Nie używane w formularzu
      updated_at: "", // Nie używane w formularzu
    };

    setFormMode("edit");
    setEditingTransaction(dto);
    setFormModalOpen(true);
  };

  const handleDelete = (id: string) => {
    // Znajdź transakcję w sections
    const transaction = sections.flatMap((s) => s.items).find((item) => item.id === id);
    if (!transaction) return;

    const dto: TransactionDTO = {
      id: transaction.id,
      type: transaction.type,
      category_code: transaction.category_code,
      category_label: transaction.category_label,
      amount_cents: transaction.amount_cents,
      occurred_on: transaction.occurred_on,
      note: transaction.note || null,
      created_at: "",
      updated_at: "",
    };

    setDeletingTransaction(dto);
    setDeleteModalOpen(true);
  };

  // Submit formularza (create/edit)
  const handleFormSubmit = async (payload: CreateTransactionPayload | UpdateTransactionPayload, id?: string) => {
    if (formMode === "create") {
      await createTransaction(payload as CreateTransactionPayload);
    } else if (id) {
      const updated = await updateTransaction(id, payload as UpdateTransactionPayload);

      // Sprawdź backdate_warning
      if (updated.backdate_warning) {
        setShowBackdateBanner(true);
        // Auto-hide po 10 sekundach
        setTimeout(() => setShowBackdateBanner(false), 10000);
      }
    }

    // Zamknij modal i refetch
    setFormModalOpen(false);
    refetch();
  };

  // Potwierdzenie usunięcia
  const handleConfirmDelete = async () => {
    if (!deletingTransaction) return;

    await deleteTransaction(deletingTransaction.id);

    // Zamknij modal i refetch
    setDeleteModalOpen(false);
    setDeletingTransaction(undefined);
    refetch();
  };

  // Sprawdź czy są jakieś aktywne filtry (oprócz miesiąca)
  const hasActiveFilters = filters.type !== "ALL" || filters.category !== null || (filters.search || "").trim() !== "";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        {/* Backdate Banner */}
        <BackdateBanner
          visible={showBackdateBanner}
          onClose={() => setShowBackdateBanner(false)}
          message="Zmieniono datę transakcji. Metryki zostały zaktualizowane."
        />

        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transakcje</h1>
            <p className="mt-2 text-muted-foreground">Przeglądaj, filtruj i zarządzaj swoimi transakcjami</p>
          </div>
          <Button onClick={handleAddTransaction}>
            <Plus className="size-4 mr-2" />
            Dodaj transakcję
          </Button>
        </header>

        {/* Filtry */}
        <div className="mb-6">
          <TransactionsFilters
            filters={filters}
            onMonthChange={setMonth}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            isNextMonthDisabled={isNextMonthDisabled}
            onTypeChange={setType}
            onCategoryChange={setCategory}
            onSearchChange={setSearch}
            onClearFilters={resetFilters}
            categories={categories}
            isLoadingCategories={isLoadingCategories}
          />
        </div>

        {/* Error state */}
        {error && !isLoading && sections.length === 0 && <ErrorState error={error} onRetry={refetch} />}

        {/* Empty state */}
        {!error && !isLoading && sections.length === 0 && (
          <EmptyState onAddTransaction={handleAddTransaction} hasFilters={hasActiveFilters} />
        )}

        {/* Lista transakcji */}
        {(sections.length > 0 || isLoading) && (
          <div className="space-y-4">
            <TransactionsListVirtual
              sections={sections}
              isLoading={isLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />

            {/* Load more button */}
            <LoadMoreButton hasMore={pagination?.has_more || false} isLoading={isLoading} onLoadMore={loadMore} />
          </div>
        )}

        {/* Modale */}
        <TransactionFormModal
          open={formModalOpen}
          mode={formMode}
          initial={editingTransaction}
          defaultType={filters.type !== "ALL" ? filters.type : "EXPENSE"}
          categories={allCategories}
          onSubmit={handleFormSubmit}
          onClose={() => setFormModalOpen(false)}
          isSubmitting={isCreating || isUpdating}
        />

        <ConfirmDeleteModal
          open={deleteModalOpen}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteModalOpen(false);
            setDeletingTransaction(undefined);
          }}
          isSubmitting={isDeleting}
          transactionInfo={
            deletingTransaction
              ? {
                  category: deletingTransaction.category_label,
                  amount: `${deletingTransaction.amount_cents / 100} zł`,
                  date: formatDateShort(deletingTransaction.occurred_on),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
