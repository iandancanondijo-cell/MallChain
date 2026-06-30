import { appConfig } from '../../config/app'

const API = appConfig.apiUrl

export async function fetchValidatorLeaderboard() {
  const res = await fetch(`${API}/validators/leaderboard`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load validator leaderboard')
  return data.validators || []
}

export async function submitValidatorApplication(application) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}/validators/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(application),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to submit validator application')
  return data.application || null
}

export async function getMyValidatorApplication(address) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}/validators/my-application?address=${encodeURIComponent(address)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to get application status')
  return data.application || null
}
