import { fireEvent, render, screen } from '@testing-library/react';
import { ArtworkForm } from './ArtworkForm';
import { emptyForm } from './formValues';

function setup(isAdmin: boolean, onSubmit = vi.fn()) {
  render(
    <ArtworkForm
      mode="new"
      title="Nowe dzieło"
      badge="0:12 · 1 zdj."
      initial={emptyForm()}
      photos={[{ id: 'p1', kind: 'przod', thumb: new Blob(['t']) }]}
      onPhotosChange={() => {}}
      isAdmin={isAdmin}
      submitLabel="Zapisz dzieło"
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  return onSubmit;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('ArtworkForm', () => {
  it('admin widzi ceny wewnętrzne, pracownik nie', () => {
    setup(true);
    expect(screen.getByText('Ceny wewnętrzne')).toBeInTheDocument();
    expect(screen.getByLabelText('Cena zakupu')).toBeInTheDocument();
    expect(screen.getByLabelText('Cena minimalna')).toBeInTheDocument();
  });

  it('w formularzu pracownika nie ma żadnych pól z cenami wewnętrznymi', () => {
    setup(false);
    expect(screen.queryByText('Ceny wewnętrzne')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cena zakupu')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cena minimalna')).not.toBeInTheDocument();
  });

  it('nie zapisuje, dopóki brakuje wymaganych pól, i podpowiada czego', () => {
    const onSubmit = setup(true);
    expect(screen.getByText('Brakuje: tytuł, artysta, wymiary, cena')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz dzieło' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('zapisuje po uzupełnieniu wymaganych pól', async () => {
    const onSubmit = setup(true);
    type('Tytuł', 'Zima');
    type('Artysta', 'Jan Kowalski');
    type('Szerokość w cm', '60');
    type('Wysokość w cm', '80');
    type('Cena sprzedaży', '1 500');
    expect(screen.queryByText(/Brakuje:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz dzieło' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Zima', salePrice: '1 500', w: '60', h: '80' });
  });

  it('rezerwacja wymaga daty', () => {
    const onSubmit = setup(false);
    type('Tytuł', 'Zima');
    type('Artysta', 'Jan');
    type('Szerokość w cm', '60');
    type('Wysokość w cm', '80');
    type('Cena sprzedaży', '100');
    fireEvent.click(screen.getByRole('button', { name: 'Rezerw.' }));
    expect(screen.getByText('Brakuje: data rezerwacji')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz dzieło' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
