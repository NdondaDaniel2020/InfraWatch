import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "../../src/components/common/Pagination";

describe("Componente <Pagination />", () => {
  it("não deve renderizar nada se totalItems for 0 ou negativo", () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        totalItems={0}
        onPageChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("deve renderizar as informações de contagem e botões de navegação", () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={vi.fn()}
        itemLabel="incidentes"
        testIdPrefix="test-pag"
      />
    );

    expect(screen.getByTestId("test-pag-container")).toBeInTheDocument();
    expect(screen.getByText(/Mostrando/i)).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText(/incidentes/i)).toBeInTheDocument();
  });

  it("deve desabilitar botão anterior na primeira página e habilitar próximo", () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        totalItems={30}
        onPageChange={vi.fn()}
        testIdPrefix="test-pag"
      />
    );

    const prevBtn = screen.getByTestId("test-pag-prev");
    const nextBtn = screen.getByTestId("test-pag-next");

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();
  });

  it("deve desabilitar botão próximo na última página", () => {
    render(
      <Pagination
        currentPage={3}
        totalPages={3}
        totalItems={30}
        onPageChange={vi.fn()}
        testIdPrefix="test-pag"
      />
    );

    const prevBtn = screen.getByTestId("test-pag-prev");
    const nextBtn = screen.getByTestId("test-pag-next");

    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();
  });

  it("deve disparar onPageChange ao clicar no botão próximo", async () => {
    const handlePageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Pagination
        currentPage={2}
        totalPages={4}
        totalItems={40}
        onPageChange={handlePageChange}
        testIdPrefix="test-pag"
      />
    );

    await user.click(screen.getByTestId("test-pag-next"));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it("deve disparar onPageChange ao clicar no botão anterior", async () => {
    const handlePageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Pagination
        currentPage={2}
        totalPages={4}
        totalItems={40}
        onPageChange={handlePageChange}
        testIdPrefix="test-pag"
      />
    );

    await user.click(screen.getByTestId("test-pag-prev"));
    expect(handlePageChange).toHaveBeenCalledWith(1);
  });

  it("deve disparar onPageSizeChange ao alterar o seletor de tamanho de página", async () => {
    const handlePageSizeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
        onPageChange={vi.fn()}
        onPageSizeChange={handlePageSizeChange}
        testIdPrefix="test-pag"
      />
    );

    const select = screen.getByTestId("test-pag-page-size-select");
    await user.selectOptions(select, "20");
    expect(handlePageSizeChange).toHaveBeenCalledWith(20);
  });
});
