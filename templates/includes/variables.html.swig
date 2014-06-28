<section class="sassdoc__item" id="variable-{{ item.name }}">

  <h2 class="sassdoc__item-name">
    <code>${{ item.name }}</code>
  </h2>

  <pre class="sassdoc__item-code">${{ item.name }}: {{ item.value }}{% if item.access == "public" %} !global{% endif %};</pre>

  {% if item.description %}
    <h3>Description</h3>
    <p class="sassdoc__item-description">{{ item.description | markdown }}</p>
  {% endif %}

  {% if item.datatype %}
    <h3>Type</h3>
    {% set datatype = item.datatype | join('</code><code>') | raw %}
    <p>{% if datatype == "*" %}Any{% else %}<code>{{ datatype }}</code>{% endif %}</p>
  {% endif %}

  {% if item.value %}
    <h3>Value</h3>
    <p class="sassdoc__item-value"><code>{{ item.value }}</code></p>
  {% endif %}

  {% if item.access %}
    <h3>Access</h3>
    <p class="sassdoc__item-access">{{ item.access }}</p>
  {% endif %}

</section>