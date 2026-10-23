import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid/index.js';
import interactionPlugin from '@fullcalendar/interaction/index.js';
import timeGridPlugin from '@fullcalendar/timegrid/index.js';
import api from '../services/api';

function minutesToClock(mins) {
  const hours = String(Math.floor(mins / 60)).padStart(2, '0');
  const minutes = String(mins % 60).padStart(2, '0');
  return `${hours}:${minutes}:00`;
}

export default function Calendar() {
  const [events, setEvents] = useState([]);

  async function load() {
    const [taskRes, timetableRes] = await Promise.all([
      api.get('/tasks'),
      api.get('/timetable').catch(() => ({ blocks: [] })),
    ]);
    const tasks = (taskRes.tasks || []).filter((task) => task.dueAt).map((task) => ({
      id: task._id,
      title: task.title,
      date: new Date(task.dueAt).toISOString(),
      backgroundColor: '#6366f1',
      borderColor: '#6366f1',
      extendedProps: { kind: 'task' },
    }));
    const classes = (timetableRes.blocks || []).map((block) => {
      const color = block.source === 'gcal' ? '#0f766e' : '#0891b2';
      const base = {
        id: `class-${block._id}`,
        title: block.source === 'gcal' ? `Calendar: ${block.title}` : `Class: ${block.title}`,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { kind: 'class' },
      };
      if (block.date) {
        const start = new Date(block.date);
        start.setHours(Math.floor(block.startMinutes / 60), block.startMinutes % 60, 0, 0);
        const end = new Date(start.getTime() + (block.endMinutes - block.startMinutes) * 60000);
        return { ...base, start: start.toISOString(), end: end.toISOString() };
      }
      return {
        ...base,
        daysOfWeek: [block.dayOfWeek],
        startTime: minutesToClock(block.startMinutes),
        endTime: minutesToClock(block.endMinutes),
      };
    });
    setEvents([...tasks, ...classes]);
  }

  useEffect(() => { load(); }, []);
  function handleDateClick(info) {
  // open modal for creating a task with that date
  const date = info.dateStr;
  const title = prompt("Task name?");
  if (!title) return;

  api.post("/tasks", { title, dueAt: date });
  load();
}

function handleEventClick(info) {
  if (info.event.extendedProps.kind === 'class') return;
  const newDate = prompt("Update deadline (YYYY-MM-DD HH:mm)?", info.event.startStr);
  if (!newDate) return;
  api.put(`/tasks/${info.event.id}`, { dueAt: newDate });
  load();
}


  return (
    <div>
      <h1 className="page-title">Task calendar</h1>
      <p className="page-subtitle">Deadlines for tasks you create in Doorway. Class times live on the Timetable and stay separate from these tasks.</p>

      <div className="card">
        <FullCalendar
          dateClick={handleDateClick}
  
  
          eventClick={handleEventClick}

          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          height={"80vh"}
        />
      </div>
    </div>
  );
}

