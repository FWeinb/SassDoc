{% if item.access | lower != "private" %}

  <section class="sassdoc__item" id="variable-{{ item.name }}">

    <h2 class="sassdoc__item-name">
      {% if item.deprecated != false %}
        <span class="sassdoc__item-deprecated" title="{{ item.deprecated }}">[Deprecated]</span>
      {% endif %}
      <code>${{ item.name }}</code>
    </h2>

    <pre class="sassdoc__item-code">${{ item.name }}: {{ item.value }}{% if item.access == "public" %} !global{% endif %};</pre>

    {% if item.description %}
      <h3>Description</h3>
      <p class="sassdoc__item-description">{{ item.description | markdown }}</p>
    {% endif %}

    {% if item.datatype %}
      <h3>Type</h3>
      <p>{% if item.datatype == "*" %}Any{% else %}<code>{{ item.datatype }}</code>{% endif %}</p>
    {% endif %}

    {% if item.value %}
      <h3>Value</h3>
      <p class="sassdoc__item-value"><code>{{ item.value }}</code></p>
    {% endif %}

    {% if item.since %}
      <h3>Since</h3>
      <p>{{ item.since | markdown }}</p>
    {% endif %}

    {% if item.todos.length > 0 %}
      <h3>TODO's</h3>
      {% for _todo in item.todos %}
        {% if loop.first %}<ul class="sassdoc__item-todos">{% endif %}
        <li>{{ _todo | markdown }}</li>
        {% if loop.last %}</ul>{% endif %}
      {% endfor %}
    {% endif %}

    {% if item.links.length > 0 %}
      <h3>Links</h3>
      {% for _link in item.links %}
        {% if loop.first %}<ul class="sassdoc__item-links">{% endif %}
        <li><a href="{{ _link.url }}">
          {% if _link.caption %}
            {{ _link.caption }}
          {% else %}
            {{ _link.url }}
          {% endif %}
        </a></li>
        {% if loop.last %}</ul>{% endif %}
      {% endfor %}
    {% endif %}

  </section>

{% endif %}