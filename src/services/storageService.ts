/**
 * @file storageService.ts
 * @description A low-level service for persisting data.
 * It abstracts the underlying storage mechanism (Chrome local storage or a remote API).
 * This service should not contain any business-specific logic.
 */

const USE_REMOTE_API = false; // Switch to toggle between local and remote storage

class StorageService {
  /**
   * Retrieves an item from storage.
   * @param key The key of the item to retrieve.
   * @param defaultValue The default value to return if the item doesn't exist.
   * @returns A promise that resolves with the retrieved item or the default value.
   */
  public async getItem<T>(key: string, defaultValue: T): Promise<T> {
    if (USE_REMOTE_API) {
      // TODO: Implement remote API call to get item
      // try {
      //   const response = await api.get(`/storage/${key}`);
      //   return response.data.value;
      // } catch (error) {
      //   console.error(`[StorageService] Failed to get remote item for key: ${key}`, error);
      //   return defaultValue;
      // }
      console.warn('[StorageService] Remote storage is enabled but not implemented. Falling back to local storage.');
    }
    
    try {
      const result = await chrome.storage.local.get(key);
      const value = result[key];
      return value === undefined ? defaultValue : (value as T);
    } catch (error) {
      console.error(`[StorageService] Failed to get local item for key: ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * Saves an item to storage.
   * @param key The key of the item to save.
   * @param value The value to save.
   * @returns A promise that resolves when the item is saved.
   */
  public async setItem<T>(key: string, value: T): Promise<void> {
    if (USE_REMOTE_API) {
      // TODO: Implement remote API call to set item
      // try {
      //   await api.post(`/storage/${key}`, { value });
      //   return;
      // } catch (error) {
      //   console.error(`[StorageService] Failed to set remote item for key: ${key}`, error);
      //   // Fallback to local storage or handle error appropriately
      // }
      console.warn('[StorageService] Remote storage is enabled but not implemented. Falling back to local storage.');
    }

    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`[StorageService] Failed to set local item for key: ${key}`, error);
    }
  }

  /**
   * Removes an item from storage.
   * @param key The key of the item to remove.
   * @returns A promise that resolves when the item is removed.
   */
  public async removeItem(key: string): Promise<void> {
    if (USE_REMOTE_API) {
      // TODO: Implement remote API call to remove item
      // try {
      //   await api.delete(`/storage/${key}`);
      //   return;
      // } catch (error) {
      //   console.error(`[StorageService] Failed to remove remote item for key: ${key}`, error);
      // }
       console.warn('[StorageService] Remote storage is enabled but not implemented. Falling back to local storage.');
    }

    try {
      await chrome.storage.local.remove(key);
    } catch (error){
      console.error(`[StorageService] Failed to remove local item for key: ${key}`, error);
    }
  }
}

// Export a singleton instance
export const storageService = new StorageService();
