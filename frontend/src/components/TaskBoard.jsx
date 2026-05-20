import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getTasks, createTask, updateTask, deleteTask, getTeam } from '../api/client'

export default function TaskBoard({ user }) {
  const { teamId } = useParams()
  const [tasks, setTasks] = useState([])
  const [team, setTeam] = useState(null)
  const [newTask, setNewTask] = useState({ title: '', assigned_to: '', description: '' })
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadTasks()
    getTeam(teamId).then(({ data }) => setTeam(data))
  }, [teamId])

  const loadTasks = () => {
    getTasks({ team_id: teamId }).then(({ data }) => setTasks(data))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    await createTask({
      team_id: parseInt(teamId),
      assigned_to: parseInt(newTask.assigned_to),
      assigned_by: user.id,
      title: newTask.title,
      description: newTask.description,
    })
    setNewTask({ title: '', assigned_to: '', description: '' })
    setShowForm(false)
    loadTasks()
  }

  const toggleComplete = async (task) => {
    await updateTask(task.id, { completed: !task.completed })
    loadTasks()
  }

  const handleDelete = async (taskId) => {
    await deleteTask(taskId)
    loadTasks()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          + New Task
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Task title"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              className="w-full border rounded-lg p-2"
              required
            />
            <textarea
              placeholder="Description"
              value={newTask.description}
              onChange={e => setNewTask({ ...newTask, description: e.target.value })}
              className="w-full border rounded-lg p-2"
              rows={2}
            />
            <select
              value={newTask.assigned_to}
              onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })}
              className="w-full border rounded-lg p-2"
              required
            >
              <option value="">Assign to...</option>
              {team?.members?.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_name}
                </option>
              ))}
            </select>
            <div className="flex space-x-2">
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg">
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-200 px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {tasks.map(task => (
          <div
            key={task.id}
            className={`bg-white rounded-lg border p-4 flex items-start justify-between ${
              task.completed ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleComplete(task)}
                className="mt-1 h-4 w-4 text-indigo-600 rounded"
              />
              <div>
                <p className={`font-medium ${task.completed ? 'line-through' : ''}`}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Created {new Date(task.created_at).toLocaleDateString()}
                  {task.due_date && ` · Due ${new Date(task.due_date).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(task.id)}
              className="text-gray-400 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-gray-500 py-8">No tasks yet</p>
        )}
      </div>
    </div>
  )
}