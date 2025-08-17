    // Global variables
    let data = null;
    let expandState = {};
    const baseURL = window.location.hostname === 'localhost' ? 'http://localhost:3000/' :
      'https://web-push-3zaz.onrender.com/';

    // Initialize the application
    document.addEventListener('DOMContentLoaded', function () {
      loadFamilyTree();
    });

    // Load family tree data
    function loadFamilyTree() {

      fetch(baseURL + 'family')
        .then(response => response.json())
        .then(json => {
          data = json;
          document.getElementById('loadingState').style.display = 'none';
          document.getElementById('treeContent').style.display = 'block';
          collapseAll();
        })
        .catch(err => {
          document.getElementById('loadingState').innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 0.5rem;"></i>
            Failed to load family tree: ${err.message}
          `;
        });
    }

    // Render the complete family tree
    function renderTree() {
      if (!data || !data.rootPerson) return;

      document.getElementById('familyName').textContent = data.familyName || 'Family Tree';
      const container = document.getElementById('treeContent');
      container.innerHTML = '';
      container.appendChild(renderMember(data.rootPerson, null, 'root', 0));
    }

    // Render individual family member
    function renderMember(member, parent, path, level) {
      const card = document.createElement('div');
      card.className = 'member-card' + (member.gender == "Female" ? " female" : " male");
      card.style.animationDelay = `${level * 0.1}s`;
      card.setAttribute('data-path', path);

      // Determine if member is deceased
      const isDeceased = member.dod && member.dod.trim() !== '';
      const statusColor = isDeceased ? 'var(--text-muted)' : 'var(--success-color)';

      // Avatar HTML
      const avatarHTML = member.image
        ? `<img src="${member.image}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <i class="fas fa-user" style="display: none;"></i>`
        : `<i class="fas fa-user"></i>`;

      // Build member details
      const details = [
        { icon: 'venus-mars', label: 'Gender', value: member.gender || 'Not specified' },
        { icon: 'heart', label: 'Status', value: member.maritalStatus || 'Not specified' },
        { icon: 'pray', label: 'Religion', value: member.religion || 'Not specified' },
        { icon: 'calendar-alt', label: 'Born', value: formatDate(member.dob) || 'Unknown' }
      ];

      if (isDeceased) {
        details.push({ icon: 'cross', label: 'Died', value: formatDate(member.dod) });
      }

      const detailsHTML = details.map(detail => `
        <div class="detail-item">
          <i class="fas fa-${detail.icon}"></i>
          <span>${detail.value}</span>
        </div>
      `).join('');

      // Main card content
      card.innerHTML = `
        <div class="card-header">
          <div class="avatar-container">
            <div class="avatar">
              ${avatarHTML}
            </div>
            <div class="status-indicator" style="background: ${statusColor};"></div>
          </div>
          <div class="member-info">
            <div class="member-name">
              ${member.name}
              <span class="serial-badge">#${member.serial || 'N/A'}</span>
            </div>
            <div class="member-details">
              ${detailsHTML}
            </div>
            ${member.notes ? `<div class="member-notes"><i class="fas fa-quote-left"></i> ${member.notes}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-success btn-sm" onclick="showModal('spouse', '${path}')">
            <i class="fas fa-ring"></i> Add Spouse
          </button>
          <button class="btn btn-primary btn-sm" onclick="showModal('child', '${path}')">
            <i class="fas fa-baby"></i> Add Child
          </button>
          <button class="btn btn-warning btn-sm" onclick="showModal('edit', '${path}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          ${path !== 'root' ? `<button class="btn btn-danger btn-sm" onclick="deleteMember('${path}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
        </div>
      `;

      // Add spouses section
      if (member.spouses && member.spouses.length > 0) {
        const spousesSection = createSection('spouses', path, member, 'Spouses', 'ring', level);
        card.appendChild(spousesSection);
      }

      // Add children section
      if (member.children && member.children.length > 0) {
        const childrenSection = createSection('children', path, member, 'Children', 'users', level);
        card.appendChild(childrenSection);
      }

      return card;
    }

    // Create expandable section (spouses/children)
    function createSection(type, path, member, title, icon, level) {
      const section = document.createElement('div');
      section.className = 'tree-connections';

      const sectionPath = `${path}.${type}`;
      const isExp = isExpanded(sectionPath);

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'section-header';
      sectionHeader.innerHTML = `
        <button class="toggle-btn ${isExp ? 'expanded' : ''}" >
          <i class="fas fa-chevron-right"></i>
        </button>
        <i class="fas fa-${icon}"></i>
        <span class="section-title">${title} (${member[type].length})</span>
      `;

      sectionHeader.onclick = () => toggleSection(sectionPath);

      const sectionContent = document.createElement('div');
      sectionContent.className = `section-content ${isExp ? 'expanded' : 'collapsed'}`;
      sectionContent.id = `section-${sectionPath.replace(/[\[\].]/g, '-')}`;

      if (isExp) {
        member[type].forEach((item, i) => {
          const itemElement = renderMember(item, member, `${path}.${type}[${i}]`, level + 1);
          sectionContent.appendChild(itemElement);
        });
      }

      section.appendChild(sectionHeader);
      section.appendChild(sectionContent);

      return section;
    }

    // Optimized toggle section function
    function toggleSection(sectionPath) {
      const isCurrentlyExpanded = isExpanded(sectionPath);
      expandState[sectionPath] = !isCurrentlyExpanded;

      // Find the specific section content
      const sectionContentId = `section-${sectionPath.replace(/[\[\].]/g, '-')}`;
      const sectionContent = document.getElementById(sectionContentId);
      const toggleBtn = sectionContent.parentElement.querySelector('.toggle-btn');
      const treeConnections = toggleBtn.parentElement;

      if (!isCurrentlyExpanded) {
        // Expanding
        toggleBtn.classList.add('expanded');
        treeConnections.classList.add('expanded');
        sectionContent.className = 'section-content expanded';

        // Get the data and render items
        const pathParts = sectionPath.split('.');
        const type = pathParts[pathParts.length - 1];
        const memberPath = pathParts.slice(0, -1).join('.');
        const member = getByPath(memberPath);

        // Clear and render items
        sectionContent.innerHTML = '';
        if (member[type] && member[type].length > 0) {
          const level = pathParts.length - 1;
          member[type].forEach((item, i) => {
            const itemElement = renderMember(item, member, `${memberPath}.${type}[${i}]`, level);
            sectionContent.appendChild(itemElement);
          });
        }
      } else {
        // Collapsing
        toggleBtn.classList.remove('expanded');
        treeConnections.classList.remove('expanded');
        sectionContent.className = 'section-content collapsed';

        // Clear content after animation
        setTimeout(() => {
          if (sectionContent.classList.contains('collapsed')) {
            sectionContent.innerHTML = '';
          }
        }, 400);
      }
    }

    // Check if section is expanded
    function isExpanded(path) {
      return expandState[path] !== false; // Default to expanded
    }

    // Expand all sections
    function expandAll() {
      expandState = {};
      renderTree();
    }

    // Collapse all sections
    function collapseAll() {
      function setAllCollapsed(obj, currentPath) {
        if (obj.spouses && obj.spouses.length > 0) {
          expandState[currentPath + '.spouses'] = false;
          obj.spouses.forEach((spouse, i) => {
            setAllCollapsed(spouse, currentPath + `.spouses[${i}]`);
          });
        }
        if (obj.children && obj.children.length > 0) {
          expandState[currentPath + '.children'] = false;
          obj.children.forEach((child, i) => {
            setAllCollapsed(child, currentPath + `.children[${i}]`);
          });
        }
      }

      setAllCollapsed(data.rootPerson, 'root');
      renderTree();
    }

    // Show modal for adding/editing members
    function showModal(type, path) {
      const modal = document.getElementById('modal');
      const form = document.getElementById('memberForm');
      const title = document.getElementById('modalTitle');
      const subtitle = document.getElementById('modalSubtitle');

      // Reset form
      form.reset();

      let member = {};
      if (type === 'edit') {
        member = getByPath(path);
        title.textContent = 'Edit Family Member';
        subtitle.textContent = `Update information for ${member.name}`;

        // Populate form with existing data
        Object.keys(member).forEach(key => {
          const input = form.querySelector(`[name="${key}"]`);
          if (input && member[key] !== null && member[key] !== undefined) {
            input.value = member[key];
          }
        });
      } else {
        title.textContent = type === 'spouse' ? 'Add Spouse' : 'Add Child';
        subtitle.textContent = `Add new ${type} to the family tree`;
      }

      // Store form context
      form.dataset.type = type;
      form.dataset.path = path;

      modal.classList.add('show');
    }

    // Close modal
    function closeModal() {
      document.getElementById('modal').classList.remove('show');
    }

    // Handle form submission
    document.getElementById('memberForm').addEventListener('submit', function (e) {
      e.preventDefault();

      const formData = new FormData(this);
      const memberData = {};

      // Convert form data to object
      for (let [key, value] of formData.entries()) {
        if (value.trim()) {
          memberData[key] = value.trim();
        }
      }

      const type = this.dataset.type;
      const path = this.dataset.path;

      if (type === 'edit') {
        // Edit existing member
        const member = getByPath(path);
        Object.assign(member, memberData);

        // Re-render just this member card
        const memberCard = document.querySelector(`[data-path="${path}"]`);
        const newCard = renderMember(member, null, path, 0);
        memberCard.parentNode.replaceChild(newCard, memberCard);

      } else {
        // Add new member
        memberData.serial = getNextSerial(data.rootPerson) + 1;
        memberData.spouses = [];
        memberData.children = [];

        const parent = getByPath(path);
        if (type === 'spouse') {
          parent.spouses = parent.spouses || [];
          parent.spouses.push(memberData);

          // Update the spouses section if it exists and is expanded
          const spousesPath = `${path}.spouses`;
          if (isExpanded(spousesPath)) {
            const sectionContentId = `section-${spousesPath.replace(/[\[\].]/g, '-')}`;
            const sectionContent = document.getElementById(sectionContentId);
            if (sectionContent) {
              const newIndex = parent.spouses.length - 1;
              const newSpouse = renderMember(memberData, parent, `${path}.spouses[${newIndex}]`, path.split('.').length);
              sectionContent.appendChild(newSpouse);
            }
          }

        } else if (type === 'child') {
          parent.children = parent.children || [];
          parent.children.push(memberData);

          // Update the children section if it exists and is expanded
          const childrenPath = `${path}.children`;
          if (isExpanded(childrenPath)) {
            const sectionContentId = `section-${childrenPath.replace(/[\[\].]/g, '-')}`;
            const sectionContent = document.getElementById(sectionContentId);
            if (sectionContent) {
              const newIndex = parent.children.length - 1;
              const newChild = renderMember(memberData, parent, `${path}.children[${newIndex}]`, path.split('.').length);
              sectionContent.appendChild(newChild);
            }
          }
        }

        // Update section headers to reflect new counts
        const parentCard = document.querySelector(`[data-path="${path}"]`);
        if (parentCard) {
          const sectionHeaders = parentCard.querySelectorAll('.section-title');
          sectionHeaders.forEach(header => {
            const text = header.textContent;
            if (type === 'spouse' && text.includes('Spouses')) {
              header.textContent = `Spouses (${parent.spouses.length})`;
            } else if (type === 'child' && text.includes('Children')) {
              header.textContent = `Children (${parent.children.length})`;
            }
          });
        }
      }

      closeModal();
      uploadDataToServer();
    });

    function uploadDataToServer()
    {
      const jsonStr = JSON.stringify(data, null, 2);
      fetch(baseURL + 'family', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: jsonStr
      }).then(response => {
        if (response.ok) {
          console.log('Family tree exported successfully!');
        } else {
          alert('Error exporting family tree: ' + response.statusText);
        }
      }).catch(error => {
        alert('Error exporting family tree: ' + error.message);
      });
    }

    // Delete member
    function deleteMember(path) {
      if (!confirm('Are you sure you want to delete this member and all their descendants?')) {
        return;
      }

      const pathParts = path.split('.');
      const lastPart = pathParts.pop();
      const parentPath = pathParts.join('.');
      const parent = getByPath(parentPath);

      const match = lastPart.match(/(\w+)\[(\d+)\]/);
      if (match) {
        const arrayName = match[1];
        const index = parseInt(match[2]);
        if (parent && parent[arrayName]) {
          parent[arrayName].splice(index, 1);

          // Remove the member card from DOM
          const memberCard = document.querySelector(`[data-path="${path}"]`);
          if (memberCard) {
            memberCard.remove();
          }

          // Update section header counts
          const parentCard = document.querySelector(`[data-path="${parentPath}"]`);
          if (parentCard) {
            const sectionHeaders = parentCard.querySelectorAll('.section-title');
            sectionHeaders.forEach(header => {
              const text = header.textContent;
              if (arrayName === 'spouses' && text.includes('Spouses')) {
                header.textContent = `Spouses (${parent.spouses.length})`;
              } else if (arrayName === 'children' && text.includes('Children')) {
                header.textContent = `Children (${parent.children.length})`;
              }
            });
          }
        }
      }

      uploadDataToServer();
    }

    // Get member by path
    function getByPath(path) {
      if (path === 'root') return data.rootPerson;

      let obj = data.rootPerson;
      const regex = /(\w+)\[(\d+)\]/g;
      let match;

      while ((match = regex.exec(path)) !== null) {
        const arrayName = match[1];
        const index = parseInt(match[2]);
        obj = obj[arrayName][index];
      }

      return obj;
    }

    // Get next serial number
    function getNextSerial(obj, max = 0) {
      if (!obj) return max;

      if (obj.serial && obj.serial > max) {
        max = obj.serial;
      }

      if (obj.spouses) {
        obj.spouses.forEach(spouse => {
          if (spouse.serial && spouse.serial > max) {
            max = spouse.serial;
          }
          if (spouse.children) {
            spouse.children.forEach(child => {
              max = getNextSerial(child, max);
            });
          }
        });
      }

      if (obj.children) {
        obj.children.forEach(child => {
          max = getNextSerial(child, max);
        });
      }

      return max;
    }

    // Format date for display
    function formatDate(dateString) {
      if (!dateString || dateString.trim() === '') return null;

      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (e) {
        return dateString; // Return original if parsing fails
      }
    }

    // Export JSON
    async function exportJSON() {
      if (!data) {
        alert('No data to export');
        return;
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.familyName || 'family_tree'}.json`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }

    // Import JSON
    function importJSON(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.familyName && imported.rootPerson) {
            data = imported;
            expandState = {}; // Reset expansion state
            collapseAll();
            uploadDataToServer();
            console.log('Family tree imported successfully!');
          } else {
            alert('Invalid family tree JSON structure.');
          }
        } catch (err) {
          alert('Error parsing JSON: ' + err.message);
        }
      };
      reader.readAsText(file);

      // Reset file input
      event.target.value = '';
    }

    // Close modal when clicking overlay
    document.getElementById('modal').addEventListener('click', function (e) {
      if (e.target === this) {
        closeModal();
      }
    });

    // Global function assignments
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.deleteMember = deleteMember;
    window.toggleSection = toggleSection;
    window.expandAll = expandAll;
    window.collapseAll = collapseAll;
    window.exportJSON = exportJSON;
    window.importJSON = importJSON;