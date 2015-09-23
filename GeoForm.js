/**
 * GeoForm.js
 * @author Sebastian Nette <sebastian.nette@tu-clausthal.de>
 */
(function (window) {

  var $ = window.jQuery || window.$;

  window.GeoForm = function (form, key) {

    /* config */
    var API_KEY = key
      , INVALID_ZIPCODE = "Invalid zipcode"
      , SELECT_COUNTRY = "Please select a country!"
      , ENTER_ZIPCODE = "Pleaser enter zipcode!";

    /* jQuery fields */
    var $form = $(form)
      , $country = $form.find('select[name="country"]')
      , $zipcode = $form.find('input[name="zipcode"]')
      , $lookup = $form.find('input[name="lookup"]')
      , $result = $form.find('span[name="result"]')
      , $submit = $form.find('input[name="submit"]');

    /* flags and other */
    var isQuerying = false
      , cities_by_name = {}
      , cities = [];

    // handle for submit
    $form.submit(function(e) {
      var city = $form.find('input[name="city"], select[name="city"]').val();
      var area = cities_by_name[city];
      if (area) {
        for (var prop in area) {
          if (area.hasOwnProperty(prop)) {
            $('<input type="hidden" />').attr("name", prop).val(area[prop]).appendTo($form);
          }
        }
        return true;
      }
      return false;
    });

    // look up zip code on enter
    $zipcode.keydown(function(e) {
      if (e.keyCode === 13) {
        lookup();
      }
    });

    // look up zip code on button click
    $lookup.click(lookup);

    /**
     * Verifies that a result has an administrative area level and renders the results.
     *     0 results:  Error Message
     *     1 result:   Text + Hidden Input
     *     2+ results: Drop Down
     *
     * @param {Array} results Google Geocode results json first Index
     */
    function parseResults(results) {
      cities = [];
      cities_by_name = {};
      
      // results must be an array
      for (var i = 0; i < results.length; i++) {
          
        // list of current area codes
        var area_levels = {};
            
        // get address components
        var address_components = results[i].address_components;
        for (var j = 0; j < address_components.length; j++) {
              
          var address = address_components[j];

          // address is a city
          if (address.types.indexOf('locality') !== -1) {
            cities_by_name[address.long_name] = area_levels;
            cities.push(address.long_name);
          }
                
          // check for area codes
          for (var k = 0; k < address.types.length; k++) {
            if (!address.types[k].indexOf('administrative_area_level_')) {
              if (!area_levels.hasOwnProperty(address.types[k])) {
                area_levels[address.types[k]] = address.long_name;
              }
            }
          }
        }
      }

      // remove cities without admin area levels
      for (var i = cities.length - 1; i >= 0; i--) {
        var valid = false;
        for (var prop in cities_by_name[cities[i]]) {
          if (cities_by_name[cities[i]].hasOwnProperty(prop)) {
            valid = true;
            break;
          }
        }
        if (!valid) {
          delete cities_by_name[cities[i]];
          cities.splice(i, 1)
        }
      }

      // enable/disable submit button
      $submit.prop("disabled", !cities.length);

      // empty results container
      $result.empty();
      switch (cities.length) {

        // no results
        case 0:
          $result.text(INVALID_ZIPCODE);
          break;

        // single result
        case 1:
          $result.text(cities[0]);
          $result.append($('<input type="hidden" name="city" />').val(cities[0]));
          break;

        // multiple results
        default:
          var select = $('<select name="city"></select>').appendTo($result);
          for (var i = 0; i < cities.length; i++) {
            select.append($('<option>').val(cities[i]).text(cities[i]));
          }
      }
    }

    /**
     * Calls the Geocode API for a specific country and zip code + optional address
     * Triggers either a success or error callback, if provided.
     *
     * @param {String} country The country code
     * @param {String} zipcode The postal code
     * @param {String} address The address (optional)
     * @param {Fnction} callback The callback function
     */
    function geoQuery(country, zipcode, address, callback) {
      
      // url parameters
      var data = { 
        key: API_KEY,
        components: "country:" + country + "|postal_code:" + zipcode,
        sensor: 'false',
        address: address
      };

      // ajax call
      $.getJSON('https://maps.googleapis.com/maps/api/geocode/json', data, function(response) {
        if (response.status === "OK" && response.results.length) {
          callback && callback(response.results[0], data);
        } else {
          callback && callback(null, data);
        }
      });
    }

    /**
     * Fetches the input values and then performs a GeoQuery. If there are multiple cities that share a postal code, multiple queries will be send.
     */
    function lookup() {

      if (isQuerying) return;

      var country = $country.val();
      var zipcode = $zipcode.val();

      // check inputs
      if (!country) {
        $result.text(SELECT_COUNTRY);
      } else if (!zipcode) {
        $result.text(ENTER_ZIPCODE);
      } else {
        isQuerying = true;
        $submit.prop("disabled", true);

        geoQuery(country, zipcode, '', function(result) {

          if (!result) {
            $result.text(INVALID_ZIPCODE);
            return;
          }
          
          var localities = [];
          
          // Get a list of primary cities
          var cities = result.address_components.filter(function(component) {
            return component.types.indexOf('locality') !== -1
          }).map(function(component) {
            return component.long_name;
          });

          // collect cities which share the same postcode
          var pl = result.postcode_localities;
          if (pl && pl.length) {
            for (var j = 0; j < pl.length; j++) {
              if (cities.indexOf(pl[j]) === -1 && localities.indexOf(pl[j]) === -1) {
                localities.push(pl[j]);
              }
            }
          }

          // no other cities share the postcode, just render resultd
          if (!localities.length) {
            parseResults([ result ]);
            isQuerying = false;
          }

          // collect all other cities
          else {

            var mergedResults = [ result ];

            function receive(result, data) {
              localities.splice(localities.indexOf(data.address), 1);
              if (result) {
                mergedResults.push(result);
              }
              if (!localities.length) {
                parseResults(mergedResults);
                isQuerying = false;
              }
            }

            for (var i = localities.length - 1; i >= 0; i--) {
              (function (address) {
                geoQuery(country, zipcode, address, receive);
              })(localities[i]);
            }
          }
        });
      }
    }
  }
})(window);
