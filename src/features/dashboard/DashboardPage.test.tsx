import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('pokazuje powitanie, przycisk dodania dzieła i statystyki', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Dzień dobry/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nowe dzieło/ })).toBeInTheDocument();
    expect(await screen.findByText('Dzieła w zbiorze')).toBeInTheDocument();
    expect(screen.getByText('0 zł')).toBeInTheDocument();
  });
});
