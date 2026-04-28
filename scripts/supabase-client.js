/* ============================================
   عميل Supabase والعمليات الأساسية - النسخة المصلحة (v10.1)
   ============================================ */

const SUPABASE_URL = 'https://bdeqhlrgvuhzbiyrhnuz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZXFobHJndnVoemJpeXJobnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjYxMzAsImV4cCI6MjA5MDMwMjEzMH0.KVA0-gJwyrGmvoM8-WPHhd9ExlBa9bq-Ehzu71YewPg';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// إدارة المستخدم والمصادقة (Custom Auth)
// ============================================

class UserManager {
  constructor() {
    this.currentUser = this.loadUserFromStorage();
  }

  loadUserFromStorage() {
    const userData = localStorage.getItem('currentUser');
    return userData ? JSON.parse(userData) : null;
  }

  saveUserToStorage(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUser = user;
  }

  async signup(fullName, email, password, phone, role) {
    try {
      const { data: existingUser } = await supabaseClient
        .from('users')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (existingUser) throw new Error('البريد الإلكتروني مسجل مسبقاً');

      const { data, error } = await supabaseClient
        .from('users')
        .insert([{
          full_name: fullName,
          email: email,
          password: password,
          phone: phone,
          role: role,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('خطأ في التسجيل:', error);
      throw error;
    }
  }

  async login(email, password) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .maybeSingle();

      if (error || !data) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      if (!data.is_active) throw new Error('هذا الحساب معطل، يرجى التواصل مع الإدارة');

      this.saveUserToStorage(data);
      return data;
    } catch (error) {
      console.error('خطأ في تسجيل الدخول:', error);
      throw error;
    }
  }

  logout() {
    localStorage.removeItem('currentUser');
    this.currentUser = null;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  isAdmin() { return this.currentUser?.role === 'admin'; }
  isManager() { return this.currentUser?.role === 'manager' || this.isAdmin(); }
  isMember() { return this.currentUser?.role === 'member'; }

  getRoleLabel(role) {
    const roles = { 'admin': 'مدير نظام', 'manager': 'مدير مشروع', 'member': 'عضو فريق' };
    return roles[role] || role;
  }
}

// ============================================
// إدارة المشاريع (v10.1)
// ============================================

class ProjectManager {
  async getProjects(user) {
    try {
      if (user.role === 'admin') {
        const { data, error } = await supabaseClient
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      }

      // للمدير: جلب المشاريع التي أنشأها + المشاريع التي هو عضو فيها
      if (user.role === 'manager') {
        const { data: createdProjects, error: err1 } = await supabaseClient
          .from('projects')
          .select('*')
          .eq('created_by', user.id);
        
        const { data: memberProjects, error: err2 } = await supabaseClient
          .from('project_members')
          .select('project_id')
          .eq('user_id', user.id);

        if (err1) throw err1;
        if (err2) throw err2;

        const memberProjectIds = memberProjects?.map(item => item.project_id) || [];
        const createdProjectIds = createdProjects?.map(item => item.id) || [];
        const allIds = [...new Set([...memberProjectIds, ...createdProjectIds])];

        if (allIds.length === 0) return [];

        const { data: finalProjects, error: err3 } = await supabaseClient
          .from('projects')
          .select('*')
          .in('id', allIds)
          .order('created_at', { ascending: false });
        
        if (err3) throw err3;
        return finalProjects || [];
      }

      // للعضو: جلب المشاريع التي هو عضو فيها فقط
      const { data: memberProjects, error: errMember } = await supabaseClient
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id);

      if (errMember) throw errMember;
      const projectIds = memberProjects?.map(item => item.project_id) || [];
      if (projectIds.length === 0) return [];

      const { data: allProjects, error: errFinal } = await supabaseClient
        .from('projects')
        .select('*')
        .in('id', projectIds)
        .order('created_at', { ascending: false });
      
      if (errFinal) throw errFinal;
      return allProjects || [];
    } catch (error) {
      console.error('خطأ في جلب المشاريع:', error);
      return [];
    }
  }

  async getProjectById(projectId) {
    try {
      const { data, error } = await supabaseClient
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('خطأ في جلب المشروع:', error);
      return null;
    }
  }

  async createProject(name, description, startDate, endDate, priority, userId) {
    try {
      const { data, error } = await supabaseClient
        .from('projects')
        .insert([{ 
          name, 
          description, 
          start_date: startDate, 
          end_date: endDate, 
          priority: priority || 'medium',
          status: 'active', 
          created_by: userId 
        }])
        .select().single();

      if (error) throw error;

      await supabaseClient
        .from('project_members')
        .insert([{ project_id: data.id, user_id: userId, role: 'manager' }]);

      await logActivity(userId, 'انشأ مشروعاً جديداً: ' + name, 'project', data.id);
      return data;
    } catch (error) {
      console.error('خطأ في إنشاء المشروع:', error);
      throw error;
    }
  }

  async deleteProject(projectId, userId) {
    try {
      const { data: tasks } = await supabaseClient.from('tasks').select('id').eq('project_id', projectId);
      if (tasks && tasks.length > 0) {
        const taskIds = tasks.map(t => t.id);
        await supabaseClient.from('comments').delete().in('task_id', taskIds);
      }
      await supabaseClient.from('tasks').delete().eq('project_id', projectId);
      await supabaseClient.from('project_members').delete().eq('project_id', projectId);
      await supabaseClient.from('activity_log').delete().eq('entity_id', projectId);
      const { error } = await supabaseClient.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      await logActivity(userId, 'حذف مشروعاً', 'project', projectId);
      return true;
    } catch (error) {
      console.error('خطأ في حذف المشروع:', error);
      throw error;
    }
  }
}

// ============================================
// إدارة المهام (v10.1)
// ============================================

class TaskManager {
  async getTasks(projectId, user) {
    try {
      let query = supabaseClient.from('tasks').select('*').eq('project_id', projectId);
      
      // العضو يرى فقط مهامه المسندة إليه
      if (user.role === 'member') {
        query = query.eq('assigned_to', user.id);
      }
      // المدير والآدمن يرون كل مهام المشروع
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('خطأ في جلب المهام:', error);
      return [];
    }
  }

  async getTasksForProjects(projectIds) {
    try {
      if (!projectIds || projectIds.length === 0) return [];
      const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .in('project_id', projectIds);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('خطأ في جلب مهام المشاريع:', error);
      return [];
    }
  }

  async getMyTasks(userId) {
    try {
      const { data, error } = await supabaseClient
        .from('tasks')
        .select('*, projects:project_id (name)')
        .eq('assigned_to', userId)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('خطأ في جلب مهامي:', error);
      return [];
    }
  }

  async createTask(taskData, userId) {
    try {
      const { data, error } = await supabaseClient
        .from('tasks')
        .insert([{
          title: taskData.title,
          description: taskData.description,
          project_id: taskData.projectId,
          assigned_to: taskData.assignedTo,
          created_by: userId,
          priority: taskData.priority || 'medium',
          status: 'todo',
          start_date: taskData.startDate,
          due_date: taskData.dueDate,
          progress: 0,
          is_extra: taskData.isExtra || false,
          tags: taskData.tags || ''
        }])
        .select().single();
      if (error) throw error;
      await logActivity(userId, 'انشأ مهمة جديدة: ' + taskData.title, 'task', data.id);
      return data;
    } catch (error) {
      console.error('خطأ في إنشاء المهمة:', error);
      throw error;
    }
  }

  async updateTask(taskId, updates, userId) {
    try {
      const { data, error } = await supabaseClient
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select().single();
      if (error) throw error;
      if (updates.status === 'done') {
        await supabaseClient.from('tasks').update({ completed_at: new Date().toISOString(), progress: 100 }).eq('id', taskId);
      }
      await logActivity(userId, 'حدث المهمة: ' + data.title, 'task', taskId);
      return data;
    } catch (error) {
      console.error('خطأ في تحديث المهمة:', error);
      throw error;
    }
  }

  async deleteTask(taskId, userId) {
    try {
      await supabaseClient.from('comments').delete().eq('task_id', taskId);
      await supabaseClient.from('activity_log').delete().eq('entity_id', taskId);
      const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      await logActivity(userId, 'حذف مهمة', 'task', taskId);
      return true;
    } catch (error) {
      console.error('خطأ في حذف المهمة:', error);
      throw error;
    }
  }
}

// ============================================
// إدارة التعليقات وسجل الأنشطة
// ============================================

class CommentManager {
  async getComments(taskId) {
    try {
      const { data, error } = await supabaseClient
        .from('comments')
        .select('*, users:user_id (full_name, role)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('خطأ في جلب التعليقات:', error);
      return [];
    }
  }

  async addComment(taskId, userId, content) {
    try {
      const { data, error } = await supabaseClient
        .from('comments')
        .insert([{ task_id: taskId, user_id: userId, content }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('خطأ في إضافة تعليق:', error);
      throw error;
    }
  }
}

// ============================================
// وظائف مساعدة عامة
// ============================================

async function logActivity(userId, action, entityType, entityId) {
  try {
    await supabaseClient
      .from('activity_log')
      .insert([{ user_id: userId, action, entity_type: entityType, entity_id: entityId }]);
  } catch (e) { console.error('Activity Log Error:', e); }
}

async function getActivityLog(user) {
  try {
    let query = supabaseClient.from('activity_log').select('*, users:user_id (full_name, role)');
    if (user.role !== 'admin') {
      query = query.eq('user_id', user.id);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

async function getAllUsers() {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, full_name, role')
      .eq('is_active', true)
      .neq('role', 'admin'); // استبعاد الآدمن من قائمة المهام والتحليلات
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

const statsManager = {
  calculateRating(rate, overdue) {
    if (overdue > 0) {
      if (rate >= 90) return { label: 'جيد جداً (بسبب التأخير)', class: 'badge-warning' };
      if (rate >= 70) return { label: 'جيد (بسبب التأخير)', class: 'badge-warning' };
      return { label: 'يحتاج متابعة', class: 'badge-danger' };
    }
    if (rate >= 90) return { label: 'ممتاز', class: 'badge-success' };
    if (rate >= 75) return { label: 'جيد جداً', class: 'badge-success' };
    if (rate >= 50) return { label: 'جيد', class: 'badge-warning' };
    return { label: 'مستقر', class: 'badge-info' };
  }
};

const reportManager = {
  async getUserReportData(userId, period) {
    try {
      let query = supabaseClient.from('tasks').select('*, projects:project_id (name)').eq('assigned_to', userId);
      
      if (period === 'week') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        query = query.gte('created_at', lastWeek.toISOString());
      } else if (period === 'month') {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        query = query.gte('created_at', lastMonth.toISOString());
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }
};

function calculateProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  const totalProgress = tasks.reduce((sum, task) => sum + (task.progress || 0), 0);
  return Math.round(totalProgress / tasks.length);
}

function calculateRemainingDays(endDate) {
  if (!endDate) return 0;
  const diff = new Date(endDate) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr) {
  if (!dateStr) return '---';
  return new Date(dateStr).toLocaleDateString('ar-EG');
}

function getPriorityLabel(priority) {
  const labels = { 'high': 'عالية', 'medium': 'متوسطة', 'low': 'منخفضة' };
  return labels[priority] || priority;
}

function getStatusLabel(status) {
  const labels = { 'todo': 'بانتظار البدء', 'in_progress': 'قيد التنفيذ', 'done': 'مكتملة', 'delayed': 'متأخرة' };
  return labels[status] || status;
}

function getStatusBadgeClass(status) {
  const statusClasses = {
    'todo': 'badge-info',
    'in_progress': 'badge-warning',
    'done': 'badge-success',
    'delayed': 'badge-danger'
  };
  return statusClasses[status] || 'badge-info';
}

// تصدير الكائنات للنافذة العالمية
window.userManager = new UserManager();
window.projectManager = new ProjectManager();
window.taskManager = new TaskManager();
window.commentManager = new CommentManager();
window.statsManager = statsManager;
window.reportManager = reportManager;
window.getActivityLog = getActivityLog;
window.getAllUsers = getAllUsers;
window.calculateProgress = calculateProgress;
window.calculateRemainingDays = calculateRemainingDays;
window.formatDate = formatDate;
window.getPriorityLabel = getPriorityLabel;
window.getStatusLabel = getStatusLabel;
window.getStatusBadgeClass = getStatusBadgeClass;
