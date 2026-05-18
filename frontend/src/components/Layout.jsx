import { useState, useEffect } from 'react'
import { getUnreadCount, getNotifications, markAllRead } from '../api/client'
import NotificationBell from './NotificationBell'

export default function Layout({ children, currentUser, onLogout }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (currentUser?.id) {
      getUnreadCount(currentUser.id).then(r => setUnreadCount(r.data.unread_count)).catch(() => {})
    }
  }, [currentUser])

  const toggleNotifications = async () => {
    if (!showNotifications) {
      const { data } = await getNotifications(currentUser.id)
      setNotifications(data)
    }
    setShowNotifications(!showNotifications)
  }

  const handleMarkAllRead = async () => {
    await markAllRead(currentUser.id)
    setUnreadCount(0)
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-indigo-600">Smart 1-on-1</span>
            </div>
            <div className="flex items-center space-x-3">
              <NotificationBell
                count={unreadCount}
                onClick={toggleNotifications}
              />
              <div className="text-sm text-gray-600 font-medium">
                {currentUser?.name}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Выйти
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Notification dropdown */}
      {showNotifications && (
        <div className="absolute right-4 top-16 w-96 bg-white shadow-xl rounded-lg border z-50">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Notifications</h3>
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-gray-500 text-center">No notifications</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-4 border-b hover:bg-gray-50 ${!n.read ? 'bg-indigo-50' : ''}`}
                >
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}