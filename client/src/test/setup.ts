// Test setup: adds the jest-dom matchers (toBeInTheDocument and friends), unmounts rendered components after every test, and gives jsdom the parts of the native <dialog> element it lacks.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { fontAutoBuild } from '../lib/fontAutoBuild'

// Most tests build the font by hand and count the calls, so the automatic build is off unless a test turns it on.
fontAutoBuild.enabled = false

afterEach(() => {
  cleanup()
})

// jsdom does not implement showModal()/close(). These stand-ins mimic the browser: open state, the close event, and Escape firing a cancelable cancel event that closes the dialog unless it is prevented.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  const open = Array.from(document.querySelectorAll('dialog[open]')).pop() as HTMLDialogElement | undefined
  if (!open) return
  const cancel = new Event('cancel', { cancelable: true })
  open.dispatchEvent(cancel)
  if (!cancel.defaultPrevented) open.close()
})
