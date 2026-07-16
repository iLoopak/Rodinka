// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoadedMemberAvatarImage } from '../../utils/memberAvatarImage'

const loadMemberAvatarImageMock = vi.hoisted(() => vi.fn())
const createCroppedMemberAvatarMock = vi.hoisted(() => vi.fn())

vi.mock('../../utils/memberAvatarImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/memberAvatarImage')>()
  return {
    ...actual,
    loadMemberAvatarImage: loadMemberAvatarImageMock,
    createCroppedMemberAvatar: createCroppedMemberAvatarMock,
  }
})

const { AvatarCropEditor } = await import('./AvatarCropEditor')

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  loadMemberAvatarImageMock.mockReset()
  createCroppedMemberAvatarMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function fakeLoadedImage(): LoadedMemberAvatarImage {
  return { width: 400, height: 400, source: {} as CanvasImageSource, cleanup: vi.fn() }
}

describe('AvatarCropEditor', () => {
  it('crops and calls onSave when Save is clicked; the dialog only closes once the caller does so', async () => {
    loadMemberAvatarImageMock.mockResolvedValue(fakeLoadedImage())
    const croppedFile = new File(['x'], 'member-avatar-cropped.webp')
    createCroppedMemberAvatarMock.mockResolvedValue(croppedFile)
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(createElement(AvatarCropEditor, {
      file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
      onSave,
      onCancel,
      onError: vi.fn(),
    }))

    const saveButton = await screen.findByText('Save')
    await act(async () => {
      saveButton.click()
    })

    expect(createCroppedMemberAvatarMock).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledWith(croppedFile)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps the dialog open with a retryable error when saving fails, preserving the crop', async () => {
    loadMemberAvatarImageMock.mockResolvedValue(fakeLoadedImage())
    createCroppedMemberAvatarMock.mockResolvedValue(new File(['x'], 'member-avatar-cropped.webp'))
    const onSave = vi.fn().mockRejectedValue(new Error('Fotografii se nepodařilo nahrát.'))
    const onCancel = vi.fn()

    render(createElement(AvatarCropEditor, {
      file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
      onSave,
      onCancel,
      onError: vi.fn(),
    }))

    const saveButton = await screen.findByText('Save')
    await act(async () => {
      saveButton.click()
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Fotografii se nepodařilo nahrát.')
    expect(onCancel).not.toHaveBeenCalled()
    expect((screen.getByText('Save').closest('button') as HTMLButtonElement).disabled).toBe(false)

    // Retry: clicking Save again re-derives the crop from the still-loaded
    // image and still-current transform, and calls onSave a second time.
    onSave.mockResolvedValueOnce(undefined)
    await act(async () => {
      screen.getByText('Save').click()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})
