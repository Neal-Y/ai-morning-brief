import AsyncStorage from '@react-native-async-storage/async-storage'

const DEVICE_ID_KEY = 'sift_device_id'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

let cachedId: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = generateUUID()
    await AsyncStorage.setItem(DEVICE_ID_KEY, id)
  }
  cachedId = id
  return id
}
