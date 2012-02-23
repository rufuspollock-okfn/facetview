FacetView_ is a pure javascript frontend for ElasticSearch or SOLR search
indices.

It's been developed as a jQuery plugin and lets you easily embed a faceted
browse front end into any web page.

.. _FacetView: http://okfnlabs.org/facetview/

Development is now taking place in this repo: http://github.com/okfn/facetview


Demo
====

See http://okfnlabs.org/facetview/ or if you have the source just take a look 
at index.html or simple.html


Status
======

FacetView is pretty new, and still under active development but is already
pretty stable. If you have suggestions or want to make a contribution please
check out the github repo.


Using FacetView
===============

Add the following code to your web page::

  <script type="text/javascript" src="vendor/jquery/1.7.1/jquery-1.7.1.min.js"></script>
  <script type="text/javascript" src="jquery.facetview.js"></script>

  <link rel="stylesheet" href="vendor/bootstrap/css/bootstrap.min.css">
  <script type="text/javascript" src="vendor/bootstrap/js/bootstrap.min.js"></script>  
  
  <link rel="stylesheet" href="css/facetview.css">

* BUT change the src URLs to something sensible depending on where you install 
  the files


Then add a script somewhere to your page that actually calls and sets up the 
facetview on a particular page element:

  <script type="text/javascript">
    jQuery(document).ready(function($) {
      $('.facet-view-simple').facetview({
        search_url: 'http://bibsoup.net/query?',
        search_index: 'elasticsearch',
        facets: [
            {'field': 'publisher.exact', 'size': 100, 'order':'term', 'display': 'publisher'},
            {'field': 'author.name.exact', 'display': 'author'},
            {'field': 'year.exact', 'display': 'year'}
        ],
      });
    });
  </script>


Now that you have everything ready, you will probably want to customize to
get it looking the way you want it.


Customization
=============

Once you have FacetView all ready to go, you should probably do some
customisation. There are a few ways to do this:

Edit the config in jquery.facetview.js
--------------------------------------

View the config options near the top of the file to learn more. Some 
important points:

* result_display - there is a long example of result display. It is a list of 
  lists; each list represents a line; each line contains objects; the objects 
  specify the field they should output, and pre and post information to surround
  it with
* search_url – you need this. Should be an elasticsearch or SOLR query endpoint
* search_index – your index type, solr or elasticsearch
* default_url_params – parameters to pass through with every query; should
  include “wt”:”json” for SOLR queries to return JSON, and probably
  “facet.mincount”:1 for SOLR queries to ignore zero counts on facet values
* predefined_filters – use these to apply some filters that will be appended 
  to every search. For example, customise a facetview display to only show 
  records with a particular owner / collection / tag / whatever

Pass in config settings when calling FacetView
----------------------------------------------

All of the settings can also be defined when calling FacetView, and will
overwrite the values set in the file itself. So you can do something like
this::

  <script type="text/javascript">
  jQuery(document).ready(function() {
      jQuery('YOUR-PAGE-PART').facetview({
          "search_index":"elasticsearch",
          ...
      });
  });
  </script>

Providing the location of an external config file
-----------------------------------------------

(in development)

A JSON file can be made available anywhere on the web with any of the above
listed settings in it. Then, just pass the URL of your config file when you
call FacetView, and it will read that config file for you.

Change the layout by making and using a custom CSS file
-------------------------------------------------------

Facetview uses the latest `twitter bootstrap`_. When you embed facetview in a page, 
you need to include the calls to bootstrap js and css files (see the example 
index.html here for more info). You could restyle facetview any way you want, 
either with our without bootstrap - although it would be a hassle to strip 
bootstrap out; recommend working with or around it.


Copyright and License
=====================

Copyright 2011 Open Knowledge Foundation and Cottage Labs.

Licensed under the `MIT License`_

.. _twitter bootstrap: http://twitter.github.com/bootstrap/
.. _MIT License: http://www.opensource.org/licenses/mit-license.php

