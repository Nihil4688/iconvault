// Proves the test tooling works: React renders, queries find elements, and the jest-dom matchers are available.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

function Counter() {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Clicked {n} times
    </button>
  )
}

describe('test tooling', () => {
  it('renders and reacts to clicks', async () => {
    render(<Counter />)
    const button = screen.getByRole('button', { name: /clicked 0 times/i })
    expect(button).toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.getByRole('button')).toHaveTextContent('Clicked 1 times')
  })
})
