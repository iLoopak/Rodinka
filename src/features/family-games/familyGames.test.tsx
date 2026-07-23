// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFamilyMember } from '../../utils/testFixtures'
import { GameHeader } from './components/GameHeader'
import { GameOfflineBadge } from './components/GameOfflineBadge'
import { GameRecordBadge } from './components/GameRecordBadge'
import { GamePlayerCard } from './components/GamePlayerCard'
import { GamePlayerPicker } from './components/GamePlayerPicker'
import { GamePrimaryButton } from './components/GamePrimaryButton'

afterEach(cleanup)

const alex = makeFamilyMember({ id: 'alex', display_name: 'Alex' })
const sam = makeFamilyMember({ id: 'sam', display_name: 'Sam' })

describe('GameHeader', () => {
  it('fires onBack and lets the accessible label override the visible one', () => {
    const onBack = vi.fn()
    render(<GameHeader backLabel="Back" backAccessibleLabel="Back to Rodinka" onBack={onBack} members={[alex]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rodinka' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('GameOfflineBadge', () => {
  it('renders nothing while idle and the matching label otherwise', () => {
    const labels = { syncing: 'Syncing…', synced: 'Saved', offline: 'Offline', error: 'Error' }
    const { container, rerender } = render(<GameOfflineBadge status="idle" labels={labels} />)
    expect(container.firstChild).toBeNull()
    rerender(<GameOfflineBadge status="offline" labels={labels} />)
    expect(screen.getByText('Offline')).toBeTruthy()
  })
})

describe('GameRecordBadge', () => {
  it('shows the stacked label/value format, or the no-record phrase alone', () => {
    const { rerender } = render(<GameRecordBadge label="Personal best" value="7485 m" noRecordLabel="No record yet" />)
    expect(screen.getByText('Personal best')).toBeTruthy()
    expect(screen.getByText('7485 m')).toBeTruthy()
    expect(screen.queryByText('No record yet')).toBeNull()
    rerender(<GameRecordBadge label="Personal best" value={null} noRecordLabel="No record yet" />)
    expect(screen.getByText('No record yet')).toBeTruthy()
    expect(screen.queryByText('Personal best')).toBeNull()
  })
})

describe('GamePlayerCard', () => {
  it('marks the selected card, fires onSelect, and shows its record', () => {
    const onSelect = vi.fn()
    render(<GamePlayerCard member={alex} selected onSelect={onSelect} figure={<span>figure</span>} recordValue="120" recordLabel="Best" noRecordLabel="None" />)
    const button = screen.getByRole('button', { pressed: true })
    expect(button.className).toContain('is-selected')
    fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('120')).toBeTruthy()
  })

  it('omits the record row entirely when no record props are given', () => {
    render(<GamePlayerCard member={sam} selected={false} onSelect={vi.fn()} figure={<span>figure</span>} />)
    expect(screen.queryByText('None')).toBeNull()
    expect(document.querySelector('.game-record-badge')).toBeNull()
  })
})

describe('GamePlayerPicker', () => {
  it('renders one card per member and reports the selected id on click', () => {
    const onSelect = vi.fn()
    render(<GamePlayerPicker
      heading="Choose a player"
      members={[alex, sam]}
      selectedId={alex.id}
      onSelect={onSelect}
      renderFigure={(member) => <span>{member.display_name} figure</span>}
      recordFor={(member) => member.id === alex.id ? '10' : null}
      recordLabel="Best"
      noRecordLabel="No record yet"
    />)
    expect(screen.getByRole('heading', { name: 'Choose a player' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Sam/ }))
    expect(onSelect).toHaveBeenCalledWith(sam.id)
    expect(screen.getByText('No record yet')).toBeTruthy()
  })

  it('shows the loading label instead of the grid while loading', () => {
    render(<GamePlayerPicker
      heading="Choose a player"
      members={[]}
      selectedId=""
      onSelect={vi.fn()}
      loading
      loadingLabel="Loading…"
      renderFigure={() => null}
      recordFor={() => null}
      recordLabel="Best"
      noRecordLabel="No record yet"
    />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })
})

describe('GamePrimaryButton', () => {
  it('renders as a button and forwards click handling and disabled state', () => {
    const onClick = vi.fn()
    render(<GamePrimaryButton onClick={onClick}>Play</GamePrimaryButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
